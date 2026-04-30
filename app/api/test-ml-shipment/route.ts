import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const credRes = await query("SELECT access_token FROM mercado_livre_credentials WHERE ml_user_id = '242678667' LIMIT 1");
    if (credRes.rows.length === 0) return NextResponse.json({ error: "no cred" });

    const token = credRes.rows[0].access_token;
    
    // fetch an order
    const d = new Date(); d.setDate(d.getDate() - 30);
    const dateStr = encodeURIComponent(d.toISOString());
    const ordersReq = await fetch(`https://api.mercadolibre.com/orders/search?seller=242678667&order.date_created.from=${dateStr}&limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const ordersData = await ordersReq.json();
    
    const results = [];
    for (const order of ordersData.results) {
        if (order.shipping && order.shipping.id) {
            const shipReq = await fetch(`https://api.mercadolibre.com/shipments/${order.shipping.id}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const ship = await shipReq.json();
            results.push(ship);
            if (results.length >= 2) break;
        }
    }

    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
