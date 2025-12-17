import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    // Query to find ALL Foreign Keys referencing the 'sales' table
    const result = await query(`
      SELECT
          conname AS constraint_name,
          conrelid::regclass::text AS table_with_fk,
          confrelid::regclass::text AS referenced_table
      FROM pg_constraint
      WHERE confrelid = 'public.sales'::regclass
    `);

    // Also list recent tables to see if we missed anything obvious
    const tables = await query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
    `);

    return NextResponse.json({
        constraints: result.rows,
        all_tables: tables.rows.map((r: any) => r.table_name)
    }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ 
        error: error.message,
        details: error.stack 
    }, { status: 500 });
  }
}
