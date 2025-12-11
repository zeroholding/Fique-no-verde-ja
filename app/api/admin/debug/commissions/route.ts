import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

export async function GET(request: NextRequest) {
  try {
    // Auth Check
    const token = request.cookies.get("token")?.value;
    if (!token) throw new Error("Unauthorized");
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Admin Check
    const userRes = await query("SELECT is_admin FROM users WHERE id = $1", [decoded.userId]);
    if (!userRes.rows[0]?.is_admin) throw new Error("Forbidden");

    // Fetch Raw Data
    const result = await query(
      `SELECT 
        c.id,
        c.sale_id,
        c.commission_amount,
        c.commission_rate,
        c.commission_type,
        c.created_at,
        u.first_name as attendant
       FROM commissions c
       JOIN users u ON c.user_id = u.id
       ORDER BY c.created_at DESC
       LIMIT 50`, 
      []
    );

    return NextResponse.json({ data: result.rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
