import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

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

function calculateDelayRange(limitDate: Date, shippedDate: Date, delayHours: number): string {
  if (delayHours <= 0) return "no_delay";

  const lDate = limitDate.toISOString().split("T")[0];
  const sDate = shippedDate.toISOString().split("T")[0];

  if (delayHours > 0 && delayHours <= 24 && lDate === sDate) {
    return "same_day";
  }
  if (delayHours > 0 && delayHours <= 24) return "0-24h";
  if (delayHours > 24 && delayHours <= 48) return "24-48h";
  if (delayHours > 48 && delayHours <= 72) return "48-72h";
  return "+72h";
}

const safeDate = (dateStr: string | null | undefined, fallback: Date = new Date()) => {
  if (!dateStr) return fallback;
  try { const d = new Date(dateStr); return isNaN(d.getTime()) ? fallback : d; } 
  catch { return fallback; }
};

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const body = await req.json().catch(() => ({}));
    const mlUserId = body.ml_user_id;

    if (!mlUserId) {
      return NextResponse.json({ error: "ml_user_id is required" }, { status: 400 });
    }

    await ensureTable();

    // 1. Get Access Token and Refresh if Expired
    const authRes = await query(
      "SELECT access_token, refresh_token, expires_at FROM mercado_livre_credentials WHERE user_id = $1 AND ml_user_id = $2 LIMIT 1",
      [decoded.userId, mlUserId]
    );
    if (authRes.rows.length === 0) {
      return NextResponse.json({ error: "Account not connected" }, { status: 404 });
    }
    
    let accessToken = authRes.rows[0].access_token;
    const refreshToken = authRes.rows[0].refresh_token;
    const expiresAt = authRes.rows[0].expires_at;

    const expirationDate = new Date(expiresAt);
    const now = new Date();
    
    if (now.getTime() + 5 * 60 * 1000 > expirationDate.getTime()) {
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
         return NextResponse.json({ error: "Failed to refresh token: " + (await resp.text()) }, { status: 401 });
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

    // 2. PURGE old data for this account before re-syncing
    await query(
      `DELETE FROM mercadolivre_delays WHERE ml_user_id = $1 AND user_id = $2`,
      [String(mlUserId), decoded.userId]
    );

    // ========================================================================
    // CAMINHO A — REPUTAÇÃO ML OFICIAL
    // Em vez de varrer TODAS as vendas e calcular atraso na mão,
    // buscamos apenas os pedidos que o ML oficialmente marcou como atrasados.
    // 
    // Passo 1: GET /users/{id} → seller_reputation.transactions.delayed_handling_time.value = contagem oficial
    // Passo 2: GET /orders/search?seller={id}&tags=delayed → lista EXATA dos pedidos penalizados
    // Passo 3: Para cada pedido atrasado, buscar shipment para detalhes de data
    // ========================================================================

    // Passo 1: Pegar contagem oficial para registro
    let officialDelayCount = 0;
    let totalSales60d = 0;
    try {
      const userData = await fetchWithToken(
        `https://api.mercadolibre.com/users/${mlUserId}`,
        accessToken
      );
      const transactions = getObject(getObject(userData.seller_reputation).transactions);
      const delayedMetric = getObject(transactions.delayed_handling_time);
      officialDelayCount = getNumber(delayedMetric.value) || 0;

      // Also grab total sales for KPI
      const completedShipping = getObject(transactions.completed);
      totalSales60d = getNumber(completedShipping.total) || 0;
    } catch (e) {
      console.warn("Could not fetch user reputation data:", e);
    }

    // Passo 2: Buscar APENAS os pedidos que o ML marcou com tag "delayed"
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 60);
    const dateFromStr = encodeURIComponent(dateFrom.toISOString());

    let offset = 0;
    const limit = 50;
    const itemsToSave: any[] = [];
    let processedOrders = 0;

    while (offset < 2000) {
      const ordersData = await fetchWithToken(
        `https://api.mercadolibre.com/orders/search?seller=${mlUserId}&order.date_created.from=${dateFromStr}&sort=date_desc&limit=${limit}&offset=${offset}&tags=delayed`,
        accessToken
      ).catch((err) => {
        console.error("ML FETCH ERROR (delayed orders):", err);
        return null;
      });

      if (!ordersData || !ordersData.results || ordersData.results.length === 0) break;

      const orders = ordersData.results;
      for (const order of orders) {
        const orderId = getString(order.id) || String(getNumber(order.id) || "");
        const orderItems = Array.isArray(order.order_items) ? order.order_items : [];
        const productName = orderItems.length > 0 ? getString(getObject(orderItems[0].item).title) || "Produto Diversos" : "Sem Nome";

        const shipping = getObject(order.shipping);
        const shippingId = getNumber(shipping.id) || getString(shipping.id);

        if (!shippingId) continue;

        try {
          const shipData = await fetchWithToken(
            `https://api.mercadolibre.com/shipments/${shippingId}`,
            accessToken
          );

          const shippingStatus = getString(shipData.status) || "unknown";
          const logisticType = getString(shipData.logistic_type) || "unknown";
          const shippingMode = getString(shipData.mode) || "unknown";

          const shippedDateStr = getString(getObject(shipData.status_history).date_shipped) || getString(shipData.date_shipped);

          // Get the official SLA limit date
          let limitDateStr = getString(getObject(getObject(shipData.shipping_option).handling_time).limit);
          if (!limitDateStr && shipData.shipping_option && shipData.shipping_option.estimated_handling_limit) {
            limitDateStr = String(shipData.shipping_option.estimated_handling_limit.date);
          }
          if (!limitDateStr) {
            limitDateStr = getString(shipData.date_first_printed) || getString(order.date_created);
          }

          const limitDate = safeDate(limitDateStr, new Date(order.date_created));
          const shippedDate = safeDate(shippedDateStr, null as any);

          // Calculate delay only if shipped
          let delayHours = 0;
          let delayRange = "0-24h"; // Default for delayed orders (ML already confirmed they are late)

          if (shippedDate) {
            const delayMs = shippedDate.getTime() - limitDate.getTime();
            delayHours = delayMs / (1000 * 60 * 60);
            delayRange = calculateDelayRange(limitDate, shippedDate, delayHours);
            // If ML says it's delayed but our math says no_delay, trust ML
            if (delayRange === "no_delay") delayRange = "same_day";
          } else {
            // Not shipped yet but ML already marked as delayed
            const delayMs = new Date().getTime() - limitDate.getTime();
            delayHours = delayMs / (1000 * 60 * 60);
            delayRange = calculateDelayRange(limitDate, new Date(), delayHours);
            if (delayRange === "no_delay") delayRange = "same_day";
          }

          itemsToSave.push({
            id: orderId,
            ml_user_id: String(mlUserId),
            user_id: decoded.userId,
            product_name: productName,
            shipping_mode: shippingMode,
            logistic_type: logisticType,
            limit_date: limitDate.toISOString(),
            shipped_date: shippedDate ? shippedDate.toISOString() : null,
            delay_hours: Math.max(0, delayHours),
            delay_range: delayRange,
            status: shippingStatus
          });
        } catch (e: any) {
          // Shipment fetch failed — still save as delayed since ML tagged it
          const limitDate = safeDate(getString(order?.date_created), new Date());

          itemsToSave.push({
            id: orderId,
            ml_user_id: String(mlUserId),
            user_id: decoded.userId,
            product_name: productName || "unknown",
            shipping_mode: "unknown",
            logistic_type: "unknown",
            limit_date: limitDate.toISOString(),
            shipped_date: null,
            delay_hours: 0,
            delay_range: "same_day",
            status: "fetch_error"
          });
        }
      }

      processedOrders += orders.length;
      offset += limit;

      // Safety: if total is known and we've passed it, stop
      const total = getNumber(ordersData?.paging?.total) || 0;
      if (total > 0 && offset >= total) break;
    }

    // 3. Bulk upsert into DB — these are ONLY the officially delayed orders
    for (const item of itemsToSave) {
        await query(
            `INSERT INTO mercadolivre_delays (
               id, ml_user_id, user_id, product_name, shipping_mode, logistic_type, limit_date, shipped_date, delay_hours, delay_range, status, synced_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
               shipped_date = EXCLUDED.shipped_date,
               delay_hours = EXCLUDED.delay_hours,
               delay_range = EXCLUDED.delay_range,
               status = EXCLUDED.status,
               synced_at = CURRENT_TIMESTAMP`,
            [
              item.id, item.ml_user_id, item.user_id, item.product_name, item.shipping_mode, item.logistic_type, 
              item.limit_date, item.shipped_date, item.delay_hours, item.delay_range, item.status
            ]
        );
    }

    return NextResponse.json({
        success: true,
        message: "Sincronização concluída",
        processed: processedOrders,
        saved: itemsToSave.length,
        official_delay_count: officialDelayCount,
        total_sales_60d: totalSales60d,
    });

  } catch (error: any) {
    console.error("Delays API sync error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
