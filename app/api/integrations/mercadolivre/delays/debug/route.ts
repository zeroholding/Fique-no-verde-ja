import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

async function fetchWithToken(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, ok: res.ok, body: await res.json() };
}

export async function GET() {
  try {
    await query("DROP TABLE IF EXISTS mercadolivre_delays");
    return NextResponse.json({ success: true, message: "Table mercadolivre_delays dropped successfully. It will be recreated with correct UUID UUID types on next sync." });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
