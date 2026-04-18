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
      user_id BIGINT,
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

  // Check if sent on the exact same date (ignoring time) but later hours
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

    // 1. Get Access Token
    const authRes = await query(
      "SELECT access_token FROM mercado_livre_credentials WHERE user_id = $1 AND ml_user_id = $2 LIMIT 1",
      [decoded.userId, mlUserId]
    );
    if (authRes.rows.length === 0) {
      return NextResponse.json({ error: "Account not connected" }, { status: 404 });
    }
    const accessToken = authRes.rows[0].access_token;

    // 2. Fetch orders within the last 60 days
    // "total vendas" KPI requires a fixed reference window (e.g. 60 days) to match the official reputation metrics.
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 60);
    const dateFromStr = dateFrom.toISOString().split(".")[0] + ".000-00:00"; // format matching ML

    let offset = 0;
    const limit = 50;
    let processedOrders = 0;
    const itemsToSave: any[] = [];
    
    // Limits loop for performance in Vercel/VPS function timeout (e.g., maximum 5 pages = 250 orders per sync batch)
    // In production, we assume this is called frequently or covers enough orders.
    while (offset < 500) {
      const ordersData = await fetchWithToken(
        `https://api.mercadolibre.com/orders/search?seller=${mlUserId}&order.date_created.from=${dateFromStr}&sort=date_desc&limit=${limit}&offset=${offset}`,
        accessToken
      ).catch(() => null);

      if (!ordersData || !ordersData.results || ordersData.results.length === 0) break;

      const orders = ordersData.results;
      for (const order of orders) {
         if (order.status !== 'paid' && order.status !== 'fulfilled') continue;

         const orderId = getString(order.id) || String(getNumber(order.id) || "");
         const orderItems = Array.isArray(order.order_items) ? order.order_items : [];
         const productName = orderItems.length > 0 ? getString(getObject(orderItems[0].item).title) || "Produto Diversos" : "Sem Nome";
         
         const shipping = getObject(order.shipping);
         const shippingId = getNumber(shipping.id) || getString(shipping.id);
         
         if (!shippingId) continue;

         // Need to fetch shipment details for actual ship date
         try {
            const shipData = await fetchWithToken(
              `https://api.mercadolibre.com/shipments/${shippingId}`,
              accessToken
            );

            // Fetch the proper SLA limits from shipment endpoint
            let limitDateStr = getString(getObject(shipData.shipping_option).list_cost) || 
                               getString(getObject(getObject(shipData.shipping_option).handling_time).limit) || 
                               getString(shipData.date_first_printed) || // Usually limit revolves around this
                               ""; // Actually, let's use the explicit ML metrics
            
            const shippingStatus = getString(shipData.status);
            const logisticType = getString(shipData.logistic_type) || "unknown";
            const shippedDateStr = getString(getObject(shipData.status_history).date_shipped) || getString(shipData.date_shipped);
            
            // If the item hasn't been shipped yet, we won't be able to calculate total delay, except currently accumulated delay
            limitDateStr = limitDateStr || getString(getObject(getObject(order.shipping).estimated_limit).date) || getString(order.date_created);

            // Helper to parse dates safely without crashing
            const safeDate = (dateStr: string | null | undefined, fallback: Date = new Date()) => {
               if (!dateStr) return fallback;
               try { const d = new Date(dateStr); return isNaN(d.getTime()) ? fallback : d; } 
               catch { return fallback; }
            };

            const limitStr = limitDateStr || getString(getObject(getObject(order.shipping).estimated_limit).date) || getString(order.date_created);
            const limitDate = safeDate(limitStr);
            const shippedDate = safeDate(shippedDateStr, null as any);

            // Only track if we have shipped date or if it's already delayed (using current date)
            const realShippedDate = shippedDate || new Date();
            const delayMs = realShippedDate.getTime() - limitDate.getTime();
            const delayHours = delayMs / (1000 * 60 * 60);

            const delayRange = calculateDelayRange(limitDate, realShippedDate, delayHours);

            itemsToSave.push({
               id: orderId,
               ml_user_id: String(mlUserId),
               user_id: decoded.userId,
               product_name: productName,
               shipping_mode: getString(shipData.mode) || "unknown",
               logistic_type: logisticType || "",
               limit_date: limitDate.toISOString(),
               shipped_date: shippedDate ? shippedDate.toISOString() : null,
               delay_hours: delayHours,
               delay_range: delayRange,
               status: shippingStatus
            });
         } catch (e: any) {
            // failed to fetch individual shipment or invalid date threw inside try
            const limitStr = getString(order?.date_created);
            const safeFallbackDate = () => {
               if (!limitStr) return new Date();
               const d = new Date(limitStr);
               return isNaN(d.getTime()) ? new Date() : d;
            };
            const limitDate = safeFallbackDate();
            const realShippedDate = new Date();
            const delayMs = realShippedDate.getTime() - limitDate.getTime();
            const delayHours = delayMs / (1000 * 60 * 60);

            itemsToSave.push({
               id: orderId,
               ml_user_id: String(mlUserId),
               user_id: decoded.userId,
               product_name: productName || "unknown",
               shipping_mode: "unknown",
               logistic_type: "error",
               limit_date: limitDate.toISOString(),
               shipped_date: null,
               delay_hours: delayHours,
               delay_range: calculateDelayRange(limitDate, realShippedDate, delayHours),
               status: "fetch_error"
            });
         }
      }

      processedOrders += orders.length;
      offset += limit;
    }

    // Bulk upsert into DB
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
        saved: itemsToSave.length
    });

  } catch (error: any) {
    console.error("Delays API sync error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
