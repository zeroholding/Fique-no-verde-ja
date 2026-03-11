import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type JwtPayload = { userId: string };

/**
 * GET /api/integrations/mercadolivre/claims/affecting-reputation?ml_user_id=XYZ&page=1&limit=20
 *
 * Reads from the LOCAL database (mercado_livre_claims table).
 * Returns paginated claims where affects_reputation = 'affected'.
 * Instant response — no ML API calls.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const { searchParams } = new URL(request.url);
    const mlUserId = searchParams.get("ml_user_id");
    if (!mlUserId) return NextResponse.json({ error: "ml_user_id obrigatorio" }, { status: 400 });

    const page = Math.max(Number(searchParams.get("page") || 1), 1);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 20), 1), 100);
    const offset = (page - 1) * limit;

    // Check if table exists (graceful handling before first sync)
    try {
      await query("SELECT 1 FROM mercado_livre_claims LIMIT 0");
    } catch {
      // Table doesn't exist yet — return empty result
      return NextResponse.json({
        total_claims_checked: 0,
        affecting_count: 0,
        claims: [],
        page,
        limit,
        total_pages: 0,
        last_sync: null,
      });
    }

    // Count total affected
    const countResult = await query(
      "SELECT COUNT(*) as total FROM mercado_livre_claims WHERE user_id = $1 AND ml_user_id = $2 AND affects_reputation = 'affected'",
      [decoded.userId, mlUserId]
    );
    const affectingCount = Number(countResult.rows[0]?.total ?? 0);

    // Count total claims for this user
    const totalResult = await query(
      "SELECT COUNT(*) as total FROM mercado_livre_claims WHERE user_id = $1 AND ml_user_id = $2",
      [decoded.userId, mlUserId]
    );
    const totalChecked = Number(totalResult.rows[0]?.total ?? 0);

    // Fetch paginated affected claims
    const claimsResult = await query(
      `SELECT id, resource_id, status, type, stage, reason_id, resource, 
              date_created, last_updated, resolution_reason, resolution_closed_by,
              affects_reputation, has_incentive, due_date, message_count, synced_at
       FROM mercado_livre_claims 
       WHERE user_id = $1 AND ml_user_id = $2 AND affects_reputation = 'affected'
       ORDER BY date_created DESC
       LIMIT $3 OFFSET $4`,
      [decoded.userId, mlUserId, limit, offset]
    );

    // Get last sync time
    const syncResult = await query(
      "SELECT MAX(synced_at) as last_sync FROM mercado_livre_claims WHERE user_id = $1 AND ml_user_id = $2",
      [decoded.userId, mlUserId]
    );
    const lastSync = syncResult.rows[0]?.last_sync ?? null;

    const totalPages = Math.ceil(affectingCount / limit);

    return NextResponse.json({
      total_claims_checked: totalChecked,
      affecting_count: affectingCount,
      claims: claimsResult.rows.map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        resource_id: row.resource_id,
        status: row.status,
        type: row.type,
        stage: row.stage,
        reason_id: row.reason_id,
        resource: row.resource,
        date_created: row.date_created,
        last_updated: row.last_updated,
        resolution_reason: row.resolution_reason,
        resolution_closed_by: row.resolution_closed_by,
        affects_reputation: row.affects_reputation,
        has_incentive: row.has_incentive,
        due_date: row.due_date,
        message_count: Number(row.message_count ?? 0),
      })),
      page,
      limit,
      total_pages: totalPages,
      last_sync: lastSync,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    const status = message.includes("Conta nao conectada") ? 404 : 500;
    console.error("Erro ao buscar claims afetando reputacao:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
