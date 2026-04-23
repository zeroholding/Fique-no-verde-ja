import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

// TEMPORARY DEBUG - Check DB state per account
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    // Check what's in the DB for each account
    const dbState = await query(`
      SELECT 
        ml_user_id,
        COUNT(*) as total_rows,
        COUNT(*) FILTER (WHERE delay_range != 'no_delay') as delayed_rows,
        COUNT(*) FILTER (WHERE logistic_type = 'fulfillment') as fulfillment_rows,
        COUNT(*) FILTER (WHERE logistic_type = 'self_service') as self_service_rows,
        COUNT(*) FILTER (WHERE logistic_type = 'custom') as custom_rows,
        COUNT(*) FILTER (WHERE logistic_type = 'xd_drop_off') as xd_drop_off_rows,
        COUNT(*) FILTER (WHERE logistic_type NOT IN ('fulfillment','self_service','custom','xd_drop_off')) as other_logistic_rows,
        COUNT(DISTINCT logistic_type) as distinct_logistic_types,
        array_agg(DISTINCT logistic_type) as logistic_types,
        array_agg(DISTINCT shipping_mode) as shipping_modes,
        MIN(limit_date) as oldest_limit,
        MAX(limit_date) as newest_limit,
        MAX(synced_at) as last_synced
      FROM mercadolivre_delays
      WHERE user_id = $1
      GROUP BY ml_user_id
      ORDER BY ml_user_id
    `, [decoded.userId]);

    // Also check credentials
    const creds = await query(`
      SELECT ml_user_id, nickname, expires_at
      FROM mercado_livre_credentials
      WHERE user_id = $1
    `, [decoded.userId]);

    return NextResponse.json({
      db_state_per_account: dbState.rows,
      credentials: creds.rows.map((c: any) => ({
        ml_user_id: c.ml_user_id,
        nickname: c.nickname,
        token_expires: c.expires_at,
        token_expired: new Date(c.expires_at) < new Date()
      }))
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
