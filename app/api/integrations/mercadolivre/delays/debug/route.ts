import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await query("SELECT COUNT(*) FROM mercadolivre_delays");
    const sample = await query("SELECT id, limit_date, shipped_date, delay_hours, delay_range, status FROM mercadolivre_delays LIMIT 50");
    return NextResponse.json({ count: res.rows[0].count, sample: sample.rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
