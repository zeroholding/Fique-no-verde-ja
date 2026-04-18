import { NextResponse } from "next/server";
import { query } from "@/lib/db";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

async function fetchWithToken(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, ok: res.ok, body: await res.json() };
}

export async function GET() {
  try {
    const creds = await query("SELECT ml_user_id, access_token FROM mercado_livre_credentials LIMIT 1");
    if (creds.rows.length === 0) return NextResponse.json({ error: "No credentials" });
    const { ml_user_id, access_token } = creds.rows[0];

    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 60);
    const dateFromStr = dateFrom.toISOString().split(".")[0] + ".000-00:00"; 
    
    const url = `https://api.mercadolibre.com/orders/search?seller=${ml_user_id}&order.date_created.from=${dateFromStr}&sort=date_desc&limit=5`;
    
    const res = await fetchWithToken(url, access_token);
    
    return NextResponse.json({ url, success: res.ok, status: res.status, data: res.body });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
