import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type JwtPayload = { userId: string };

/**
 * GET /api/integrations/mercadolivre/claims/affecting-reputation
 *
 * Query params:
 *   ml_user_id (required)
 *   page, limit (pagination)
 *   status     - "opened" | "closed" | "" (all)
 *   type       - claim type filter
 *   stage      - claim stage filter
 *   incentive  - "true" | "false" | "" (all)
 *   messages   - "with" | "without" | "" (all)
 *   period     - "7" | "15" | "30" | "60" | "" (all)
 *   resolution - "mediator" | "buyer" | "seller" | "none" | "" (all)
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

    // Filter params
    const filterStatus = searchParams.get("status") || "";
    const filterType = searchParams.get("type") || "";
    const filterStage = searchParams.get("stage") || "";
    const filterIncentive = searchParams.get("incentive") || "";
    const filterMessages = searchParams.get("messages") || "";
    const filterPeriod = searchParams.get("period") || "";
    const filterResolution = searchParams.get("resolution") || "";
    const filterMediation = searchParams.get("mediation") || "";

    const sortField = searchParams.get("sortField") || "date_created";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "ASC" : "DESC";

    const filterPeriodFrom = searchParams.get("periodFrom") || "";
    const filterPeriodTo = searchParams.get("periodTo") || "";

    // Check if table exists and ensure new columns
    try {
      await query("SELECT 1 FROM mercado_livre_claims LIMIT 0");
      // Ensure new columns exist (safe migration)
      try {
        await query(`ALTER TABLE mercado_livre_claims ADD COLUMN IF NOT EXISTS product_image TEXT`);
      } catch { /* column already exists or table doesn't support IF NOT EXISTS */ }
    } catch {
      return NextResponse.json({
        total_claims_checked: 0,
        affecting_count: 0,
        claims: [],
        page,
        limit,
        total_pages: 0,
        last_sync: null,
        available_filters: {},
      });
    }

    // Build dynamic WHERE clause
    const conditions: string[] = [
      "user_id = $1",
      "ml_user_id = $2",
      "affects_reputation = 'affected'",
    ];
    const params: (string | number | boolean)[] = [decoded.userId, mlUserId];
    let paramIndex = 3;

    if (filterStatus) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filterStatus);
      paramIndex++;
    }

    if (filterType) {
      conditions.push(`type = $${paramIndex}`);
      params.push(filterType);
      paramIndex++;
    }

    if (filterStage) {
      conditions.push(`stage = $${paramIndex}`);
      params.push(filterStage);
      paramIndex++;
    }

    if (filterIncentive === "true") {
      conditions.push("has_incentive = true");
    } else if (filterIncentive === "false") {
      conditions.push("has_incentive = false");
    }

    if (filterMessages === "with") {
      conditions.push("message_count > 0");
    } else if (filterMessages === "without") {
      conditions.push("message_count = 0");
    }

    if (filterMediation === "open") {
      conditions.push("stage = 'dispute'");
    } else if (filterMediation === "no") {
      conditions.push("(stage IS NULL OR stage != 'dispute')");
    }

    // Exact period match (from ML reputation payload)
    if (filterPeriodFrom && filterPeriodTo) {
      conditions.push(`sale_date >= $${paramIndex} AND sale_date <= $${paramIndex + 1}`);
      params.push(filterPeriodFrom, filterPeriodTo);
      paramIndex += 2;
    } 
    // Fallback relative 7, 15, 30, 60
    else if (filterPeriod && ["7", "15", "30", "60"].includes(filterPeriod)) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - Number(filterPeriod));
      conditions.push(`sale_date >= $${paramIndex}`);
      params.push(daysAgo.toISOString());
      paramIndex++;
    }

    if (filterResolution === "mediator") {
      conditions.push("resolution_closed_by = 'mediator'");
    } else if (filterResolution === "buyer") {
      conditions.push("resolution_closed_by = 'complainant'");
    } else if (filterResolution === "seller") {
      conditions.push("resolution_closed_by = 'respondent'");
    } else if (filterResolution === "none") {
      conditions.push("(resolution_closed_by IS NULL OR resolution_closed_by = '')");
    }

    const whereClause = conditions.join(" AND ");

    // Count total affected (with filters)
    const countResult = await query(
      `SELECT COUNT(*) as total FROM mercado_livre_claims WHERE ${whereClause}`,
      params
    );
    const affectingCount = Number(countResult.rows[0]?.total ?? 0);

    // Count total claims for this user (no filters — overall stat)
    const totalResult = await query(
      "SELECT COUNT(*) as total FROM mercado_livre_claims WHERE user_id = $1 AND ml_user_id = $2",
      [decoded.userId, mlUserId]
    );
    const totalChecked = Number(totalResult.rows[0]?.total ?? 0);

    // Safe interpolation of sort fields to prevent SQL injection
    const allowedSortFields = ["date_created", "sale_date", "last_updated"];
    const safeSortField = allowedSortFields.includes(sortField) ? sortField : "date_created";

    // Fetch paginated affected claims (with filters)
    const claimsResult = await query(
      `SELECT id, resource_id, order_id, status, type, stage, reason_id, reason_description, product_title, product_image, product_link, sale_date, resource, 
              date_created, last_updated, resolution_reason, resolution_closed_by,
              affects_reputation, has_incentive, due_date, message_count, synced_at
       FROM mercado_livre_claims 
       WHERE ${whereClause}
       ORDER BY ${safeSortField} ${sortOrder} NULLS LAST
       LIMIT $${paramIndex}`,
      [...params, limit]
    );

    // Get last sync time
    const syncResult = await query(
      "SELECT MAX(synced_at) as last_sync FROM mercado_livre_claims WHERE user_id = $1 AND ml_user_id = $2",
      [decoded.userId, mlUserId]
    );
    const lastSync = syncResult.rows[0]?.last_sync ?? null;

    // Get available filter options (distinct values from DB)
    const [statusOpts, typeOpts, stageOpts, resOpts] = await Promise.all([
      query(
        "SELECT DISTINCT status FROM mercado_livre_claims WHERE user_id = $1 AND ml_user_id = $2 AND affects_reputation = 'affected' AND status IS NOT NULL ORDER BY status",
        [decoded.userId, mlUserId]
      ),
      query(
        "SELECT DISTINCT type FROM mercado_livre_claims WHERE user_id = $1 AND ml_user_id = $2 AND affects_reputation = 'affected' AND type IS NOT NULL ORDER BY type",
        [decoded.userId, mlUserId]
      ),
      query(
        "SELECT DISTINCT stage FROM mercado_livre_claims WHERE user_id = $1 AND ml_user_id = $2 AND affects_reputation = 'affected' AND stage IS NOT NULL ORDER BY stage",
        [decoded.userId, mlUserId]
      ),
      query(
        "SELECT DISTINCT resolution_closed_by FROM mercado_livre_claims WHERE user_id = $1 AND ml_user_id = $2 AND affects_reputation = 'affected' AND resolution_closed_by IS NOT NULL AND resolution_closed_by != '' ORDER BY resolution_closed_by",
        [decoded.userId, mlUserId]
      ),
    ]);

    const totalPages = Math.ceil(affectingCount / limit);

    return NextResponse.json({
      total_claims_checked: totalChecked,
      affecting_count: affectingCount,
      claims: claimsResult.rows.map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        resource_id: row.resource_id,
        order_id: row.order_id || null,
        status: row.status,
        type: row.type,
        stage: row.stage,
        reason_id: row.reason_id,
        reason_description: row.reason_description,
        product_title: row.product_title,
        product_image: row.product_image,
        product_link: row.product_link,
        sale_date: row.sale_date,
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
      available_filters: {
        statuses: statusOpts.rows.map((r: Record<string, unknown>) => r.status),
        types: typeOpts.rows.map((r: Record<string, unknown>) => r.type),
        stages: stageOpts.rows.map((r: Record<string, unknown>) => r.stage),
        resolutions: resOpts.rows.map((r: Record<string, unknown>) => r.resolution_closed_by),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    const status = message.includes("Conta nao conectada") ? 404 : 500;
    console.error("Erro ao buscar claims afetando reputacao:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
