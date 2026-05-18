import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
    try {
        await query(`
            ALTER TABLE evidence_logs ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
            ALTER TABLE evidence_logs ADD COLUMN IF NOT EXISTS file_type VARCHAR(100);
            ALTER TABLE evidence_logs ADD COLUMN IF NOT EXISTS evidence_date DATE;
        `);
        return NextResponse.json({ success: true });
    } catch(e: any) {
        return NextResponse.json({ error: e.message });
    }
}
