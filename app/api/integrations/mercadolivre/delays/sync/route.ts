import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

// Allow up to 5 minutes for sync of large accounts
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type JwtPayload = { userId: string };

function getObject(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function getString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function getNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  return typeof v === "string" && !isNaN(Number(v)) ? Number(v) : null;
}

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS mercadolivre_delays (
      id VARCHAR(50) NOT NULL,
      ml_user_id VARCHAR(50) NOT NULL,
      user_id VARCHAR(255),
      product_name TEXT,
      shipping_mode VARCHAR(50),
      limit_date TIMESTAMP WITH TIME ZONE,
      shipped_date TIMESTAMP WITH TIME ZONE,
      delay_hours FLOAT,
      delay_range VARCHAR(50),
      status VARCHAR(50),
      logistic_type VARCHAR(50),
      synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_ml_delays_mluser ON mercadolivre_delays (ml_user_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_ml_delays_range ON mercadolivre_delays (delay_range);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_ml_delays_limit ON mercadolivre_delays (limit_date DESC);`);
}

async function fetchWithToken(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} - Status ${res.status}`);
  }
  return res.json();
}

function calculateDelayRange(delayHours: number): string {
  if (delayHours <= 0) return "no_delay";
  if (delayHours <= 24) return "0-24h";
  if (delayHours <= 48) return "24-48h";
  if (delayHours <= 72) return "48-72h";
  return "+72h";
}

const safeDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  try { const d = new Date(dateStr); return isNaN(d.getTime()) ? null : d; }
  catch { return null; }
};

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const token = req.cookies.get("token")?.value;
        if (!token) {
          send({ error: "Unauthorized" });
          controller.close();
          return;
        }

        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
        const body = await req.json().catch(() => ({}));
        const mlUserId = body.ml_user_id;
        const accountName = body.account_name || mlUserId;

        if (!mlUserId) {
          send({ error: "ml_user_id is required" });
          controller.close();
          return;
        }

        await ensureTable();

        // 1. Get Access Token
        const authRes = await query(
          "SELECT access_token, refresh_token, expires_at FROM mercado_livre_credentials WHERE user_id = $1 AND ml_user_id = $2 LIMIT 1",
          [decoded.userId, mlUserId]
        );
        if (authRes.rows.length === 0) {
          send({ error: "Account not connected" });
          controller.close();
          return;
        }

        let accessToken = authRes.rows[0].access_token;
        const refreshToken = authRes.rows[0].refresh_token;
        const expiresAt = authRes.rows[0].expires_at;

        const expirationDate = new Date(expiresAt);
        const now = new Date();

        if (now.getTime() + 5 * 60 * 1000 > expirationDate.getTime()) {
          send({ phase: "token", message: "Renovando token..." });
          const resp = await fetch("https://api.mercadolibre.com/oauth/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              client_id: process.env.MERCADO_LIVRE_APP_ID!,
              client_secret: process.env.MERCADO_LIVRE_SECRET_KEY!,
              refresh_token: refreshToken,
            }),
          });

          if (!resp.ok) {
            send({ error: "Failed to refresh token" });
            controller.close();
            return;
          }

          const newTokenData = await resp.json();
          accessToken = newTokenData.access_token;
          const newExpiresAt = new Date();
          newExpiresAt.setSeconds(newExpiresAt.getSeconds() + newTokenData.expires_in);
          await query(
            `UPDATE mercado_livre_credentials SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW() WHERE user_id = $4 AND ml_user_id = $5`,
            [accessToken, newTokenData.refresh_token, newExpiresAt.toISOString(), decoded.userId, mlUserId]
          );
        }

        // 2. Primeiro, descobrir o total de vendas pra calcular %
        send({ phase: "counting", message: `Contando vendas de ${accountName}...` });

        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() - 1);
        const dateFrom = new Date(baseDate);
        dateFrom.setDate(baseDate.getDate() - 59);
        dateFrom.setHours(0, 0, 0, 0);
        const dateFromStr = encodeURIComponent(dateFrom.toISOString());

        let totalOrders = 0;
        try {
          const countData = await fetchWithToken(
            `https://api.mercadolibre.com/orders/search?seller=${mlUserId}&order.date_created.from=${dateFromStr}&limit=1`,
            accessToken
          );
          totalOrders = getNumber(countData?.paging?.total) || 0;
        } catch {
          send({ error: "Falha ao contar vendas" });
          controller.close();
          return;
        }

        send({ phase: "syncing", message: `Analisando ${totalOrders} vendas...`, total: totalOrders, processed: 0, percent: 0, delayed_found: 0 });

        // 3. Processar vendas
        let offset = 0;
        const limit = 50;
        let processedOrders = 0;
        const itemsToSave: any[] = [];
        let fetchErrors = 0;
        let skippedFulfillment = 0;

        while (offset < 10000 && offset < totalOrders) {
          let ordersData: any = null;
          try {
            ordersData = await fetchWithToken(
              `https://api.mercadolibre.com/orders/search?seller=${mlUserId}&order.date_created.from=${dateFromStr}&sort=date_desc&limit=${limit}&offset=${offset}`,
              accessToken
            );
          } catch (err: any) {
            fetchErrors++;
            if (offset === 0) {
              send({ error: `Falha ao buscar vendas: ${err.message}` });
              controller.close();
              return;
            }
            break;
          }

          if (!ordersData || !ordersData.results || ordersData.results.length === 0) break;

          const orders = ordersData.results;

          const validOrders = orders
            .filter((o: any) => o.status === 'paid' || o.status === 'fulfilled')
            .map((order: any) => {
              const orderId = getString(order.id) || String(getNumber(order.id) || "");
              const orderItems = Array.isArray(order.order_items) ? order.order_items : [];
              const productName = orderItems.length > 0
                ? getString(getObject(orderItems[0].item).title) || "Produto Diversos"
                : "Sem Nome";
              const shipping = getObject(order.shipping);
              const shippingId = getNumber(shipping.id) || getString(shipping.id);
              return { orderId, productName, shippingId, dateCreated: order.date_created };
            })
            .filter((o: any) => o.shippingId);

          // Processar shipments em paralelo — 10 simultâneas
          const CONCURRENCY = 10;
          for (let i = 0; i < validOrders.length; i += CONCURRENCY) {
            const batch = validOrders.slice(i, i + CONCURRENCY);
            const results = await Promise.allSettled(
              batch.map(async (orderInfo: any) => {
                const shipData = await fetchWithToken(
                  `https://api.mercadolibre.com/shipments/${orderInfo.shippingId}`,
                  accessToken
                );

                const logisticType = getString(shipData.logistic_type) || "unknown";
                if (logisticType === 'fulfillment') {
                  skippedFulfillment++;
                  return null;
                }

                const shippingMode = getString(shipData.mode) || "unknown";
                const shippingStatus = getString(shipData.status) || "unknown";

                let limitDateStr = getString(getObject(getObject(shipData.shipping_option).handling_time).limit);
                if (!limitDateStr && shipData.shipping_option?.estimated_handling_limit?.date) {
                  limitDateStr = String(shipData.shipping_option.estimated_handling_limit.date);
                }
                if (!limitDateStr) {
                  const estDeliveryTime = getObject(getObject(shipData.shipping_option).estimated_delivery_time);
                  limitDateStr = getString(estDeliveryTime.pay_before);
                }
                if (!limitDateStr) {
                  limitDateStr = getString(shipData.date_first_printed);
                }
                if (!limitDateStr) {
                  limitDateStr = getString(orderInfo.dateCreated);
                }

                const limitDate = safeDate(limitDateStr);
                if (!limitDate) return null;

                const shippedDateStr =
                  getString(getObject(shipData.status_history || {}).date_shipped) ||
                  getString(shipData.date_shipped) ||
                  getString(getObject(shipData.status_history || {}).date_handling);
                const shippedDate = safeDate(shippedDateStr);

                let delayHours = 0;
                let delayRange = "no_delay";
                if (shippedDate) {
                  const delayMs = shippedDate.getTime() - limitDate.getTime();
                  delayHours = delayMs / (1000 * 60 * 60);
                  delayRange = calculateDelayRange(delayHours);
                }

                if (delayRange === "no_delay") return null;

                return {
                  id: orderInfo.orderId,
                  ml_user_id: String(mlUserId),
                  user_id: decoded.userId,
                  product_name: orderInfo.productName,
                  shipping_mode: shippingMode,
                  logistic_type: logisticType,
                  limit_date: limitDate.toISOString(),
                  shipped_date: shippedDate ? shippedDate.toISOString() : null,
                  delay_hours: delayHours,
                  delay_range: delayRange,
                  status: shippingStatus
                };
              })
            );

            for (const result of results) {
              if (result.status === 'fulfilled' && result.value) {
                itemsToSave.push(result.value);
              } else if (result.status === 'rejected') {
                fetchErrors++;
              }
            }
          }

          processedOrders += orders.length;
          offset += limit;

          // Enviar progresso a cada página
          const percent = totalOrders > 0 ? Math.min(Math.round((processedOrders / totalOrders) * 100), 99) : 0;
          send({
            phase: "syncing",
            message: `${accountName}: ${processedOrders}/${totalOrders} vendas analisadas`,
            total: totalOrders,
            processed: processedOrders,
            percent,
            delayed_found: itemsToSave.length,
          });

          if (totalOrders > 0 && offset >= totalOrders) break;
        }

        // 4. Salvar no banco
        send({ phase: "saving", message: `Salvando ${itemsToSave.length} atrasos no banco...`, percent: 99 });

        if (itemsToSave.length > 0) {
          await query(
            `DELETE FROM mercadolivre_delays WHERE ml_user_id = $1 AND user_id = $2`,
            [String(mlUserId), decoded.userId]
          );

          const BATCH_SIZE = 50;
          for (let i = 0; i < itemsToSave.length; i += BATCH_SIZE) {
            const batch = itemsToSave.slice(i, i + BATCH_SIZE);
            for (const item of batch) {
              await query(
                `INSERT INTO mercadolivre_delays (
                   id, ml_user_id, user_id, product_name, shipping_mode, logistic_type,
                   limit_date, shipped_date, delay_hours, delay_range, status, synced_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
                 ON CONFLICT (id) DO UPDATE SET
                   shipped_date = EXCLUDED.shipped_date,
                   delay_hours = EXCLUDED.delay_hours,
                   delay_range = EXCLUDED.delay_range,
                   status = EXCLUDED.status,
                   logistic_type = EXCLUDED.logistic_type,
                   shipping_mode = EXCLUDED.shipping_mode,
                   synced_at = CURRENT_TIMESTAMP`,
                [
                  item.id, item.ml_user_id, item.user_id, item.product_name,
                  item.shipping_mode, item.logistic_type, item.limit_date,
                  item.shipped_date, item.delay_hours, item.delay_range, item.status
                ]
              );
            }
          }
        } else {
          // Limpar dados antigos se não encontrou nenhum atraso
          await query(
            `DELETE FROM mercadolivre_delays WHERE ml_user_id = $1 AND user_id = $2`,
            [String(mlUserId), decoded.userId]
          );
        }

        send({
          phase: "done",
          message: `${accountName}: concluído!`,
          percent: 100,
          processed: processedOrders,
          saved: itemsToSave.length,
          skipped_fulfillment: skippedFulfillment,
          fetch_errors: fetchErrors,
        });

        controller.close();
      } catch (error: any) {
        console.error("Delays API sync error:", error);
        send({ error: error.message || "Internal server error" });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
