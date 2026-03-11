import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const ML_APP_ID = process.env.MERCADO_LIVRE_APP_ID;
const ML_SECRET_KEY = process.env.MERCADO_LIVRE_SECRET_KEY;

type JwtPayload = { userId: string };

function getNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const p = Number(v);
    return Number.isFinite(p) ? p : null;
  }
  return null;
}
function getString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function getObject(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

async function fetchMlJsonSafe(url: string, accessToken: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: ML_APP_ID!,
      client_secret: ML_SECRET_KEY!,
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) throw new Error("Falha ao atualizar token");
  return response.json();
}

type CredentialRow = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  ml_user_id: string | number;
};

async function getValidCredential(userId: string, mlUserId: string): Promise<CredentialRow> {
  const result = await query(
    "SELECT access_token, refresh_token, expires_at, ml_user_id FROM mercado_livre_credentials WHERE user_id = $1 AND ml_user_id = $2 LIMIT 1",
    [userId, mlUserId]
  );
  if (result.rows.length === 0) throw new Error("Conta nao conectada");

  const credential = result.rows[0] as CredentialRow;
  const expirationDate = new Date(credential.expires_at);
  const now = new Date();
  if (now.getTime() + 300_000 <= expirationDate.getTime()) return credential;

  const refreshed = await refreshAccessToken(credential.refresh_token);
  const newAccessToken = getString((refreshed as Record<string, unknown>).access_token);
  const newRefreshToken =
    getString((refreshed as Record<string, unknown>).refresh_token) || credential.refresh_token;
  const expiresIn = getNumber((refreshed as Record<string, unknown>).expires_in) || 0;
  if (!newAccessToken) throw new Error("Falha ao atualizar token de acesso");

  const newExpiresAt = new Date();
  newExpiresAt.setSeconds(newExpiresAt.getSeconds() + expiresIn);
  await query(
    `UPDATE mercado_livre_credentials SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW() WHERE user_id = $4 AND ml_user_id = $5`,
    [newAccessToken, newRefreshToken, newExpiresAt.toISOString(), userId, mlUserId]
  );
  return { ...credential, access_token: newAccessToken, refresh_token: newRefreshToken, expires_at: newExpiresAt.toISOString() };
}

// ── Auto-create table if it doesn't exist ──
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS mercado_livre_claims (
      id BIGINT PRIMARY KEY,
      user_id UUID NOT NULL,
      ml_user_id VARCHAR(50) NOT NULL,
      resource_id VARCHAR(50),
      status VARCHAR(50),
      type VARCHAR(50),
      stage VARCHAR(50),
      reason_id VARCHAR(50),
      resource VARCHAR(50),
      date_created VARCHAR(50),
      last_updated VARCHAR(50),
      resolution_reason VARCHAR(255),
      resolution_closed_by VARCHAR(50),
      affects_reputation VARCHAR(20),
      has_incentive BOOLEAN DEFAULT false,
      due_date VARCHAR(50),
      message_count INTEGER DEFAULT 0,
      synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_ml_claims_user_ml
    ON mercado_livre_claims (user_id, ml_user_id, affects_reputation);
  `);
}

// ── Get message count (claim-level first, then pack fallback) ──
async function getMessageCount(
  claimId: number,
  resource: string | null,
  resourceId: number | string | null,
  mlUserId: string,
  accessToken: string
): Promise<number> {
  // 1. Try claim-level messages
  try {
    const data = await fetchMlJsonSafe(
      `https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}/messages?limit=1&offset=0`,
      accessToken
    );
    if (data) {
      const paging = getObject(data.paging);
      const total = getNumber(paging.total) ?? 0;
      const dataArr = Array.isArray(data.data) ? data.data : [];
      const msgsArr = Array.isArray(data.messages) ? data.messages : [];
      const count = total || dataArr.length || msgsArr.length;
      if (count > 0) return count;
    }
  } catch { /* ignore */ }

  // 2. Fallback via pack
  if (resource === "shipment" && resourceId) {
    try {
      const shipment = await fetchMlJsonSafe(`https://api.mercadolibre.com/shipments/${resourceId}`, accessToken);
      if (shipment) {
        const packId = getString(shipment.pack_id) || String(getNumber(shipment.order_id) ?? "");
        if (packId) {
          const threadData = await fetchMlJsonSafe(
            `https://api.mercadolibre.com/messages/packs/${packId}/sellers/${mlUserId}?tag=post_sale&limit=1&offset=0`,
            accessToken
          );
          if (threadData) {
            const paging = getObject(threadData.paging);
            return getNumber(paging.total) ?? (Array.isArray(threadData.messages) ? threadData.messages.length : 0);
          }
        }
      }
    } catch { /* ignore */ }
  } else if (resource === "order" && resourceId) {
    try {
      const order = await fetchMlJsonSafe(`https://api.mercadolibre.com/orders/${resourceId}`, accessToken);
      if (order) {
        const packId = getString(order.pack_id) || String(resourceId);
        const threadData = await fetchMlJsonSafe(
          `https://api.mercadolibre.com/messages/packs/${packId}/sellers/${mlUserId}?tag=post_sale&limit=1&offset=0`,
          accessToken
        );
        if (threadData) {
          const paging = getObject(threadData.paging);
          return getNumber(paging.total) ?? (Array.isArray(threadData.messages) ? threadData.messages.length : 0);
        }
      }
    } catch { /* ignore */ }
  }

  return 0;
}

/**
 * POST /api/integrations/mercadolivre/claims/sync?ml_user_id=XYZ
 *
 * Heavy sync operation:
 *  1. Ensures the table exists (auto-migrate).
 *  2. Fetches ALL claims from ML (no limit).
 *  3. For each, checks affects-reputation + message count if new/changed.
 *  4. Upserts into local DB.
 *
 * Returns progress stats.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const { searchParams } = new URL(request.url);
    const mlUserId = searchParams.get("ml_user_id");
    if (!mlUserId) return NextResponse.json({ error: "ml_user_id obrigatorio" }, { status: 400 });

    // 0. Ensure table
    await ensureTable();

    const credential = await getValidCredential(decoded.userId, mlUserId);
    const accessToken = credential.access_token;
    const userId = decoded.userId;

    // 1. Fetch ALL recent claims from ML (no artificial limit)
    const pageLimit = 50;
    type RawClaim = Record<string, unknown>;
    const allClaims: RawClaim[] = [];
    let offset = 0;

    while (true) {
      const claimsData = await fetchMlJsonSafe(
        `https://api.mercadolibre.com/post-purchase/v1/claims/search?player_role=respondent&player_user_id=${mlUserId}&sort=last_updated:desc&limit=${pageLimit}&offset=${offset}`,
        accessToken
      );
      if (!claimsData) break;

      const rows = Array.isArray(claimsData.data) ? claimsData.data : [];
      const paging = getObject(claimsData.paging);
      const total = getNumber(paging.total) ?? rows.length;

      for (const row of rows) {
        allClaims.push(getObject(row));
      }

      const currentLimit = getNumber(paging.limit) ?? pageLimit;
      const currentOffset = getNumber(paging.offset) ?? offset;
      const nextOffset = currentOffset + currentLimit;

      if (rows.length === 0 || nextOffset >= total) break;
      offset = nextOffset;
    }

    // 2. Get existing claim IDs + last_updated from DB to skip unchanged
    const existingResult = await query(
      "SELECT id, last_updated FROM mercado_livre_claims WHERE user_id = $1 AND ml_user_id = $2",
      [userId, mlUserId]
    );
    const existingMap = new Map<number, string>();
    for (const row of existingResult.rows) {
      existingMap.set(Number(row.id), row.last_updated || "");
    }

    // 3. Process claims in batches of 5 (lighter batches for stability)
    const batchSize = 5;
    let synced = 0;
    let skipped = 0;
    let affectedCount = 0;

    for (let i = 0; i < allClaims.length; i += batchSize) {
      const batch = allClaims.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (claim) => {
          const claimId = getNumber(claim.id);
          if (!claimId) return;

          const claimLastUpdated = getString(claim.last_updated) ?? "";

          // Skip if unchanged
          if (existingMap.has(claimId) && existingMap.get(claimId) === claimLastUpdated) {
            skipped++;
            return;
          }

          // Check affects-reputation
          let affectsReputation = "unknown";
          let hasIncentive = false;
          let dueDate: string | null = null;

          try {
            const repData = await fetchMlJsonSafe(
              `https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}/affects-reputation`,
              accessToken
            );
            if (repData) {
              affectsReputation = getString(repData.affects_reputation) ?? "unknown";
              hasIncentive = repData.has_incentive === true;
              dueDate = getString(repData.due_date);
            }
          } catch { /* ignore */ }

          // Get message count (only for affected, to save API calls)
          let messageCount = 0;
          const resource = getString(claim.resource);
          const resourceId = getNumber(claim.resource_id) ?? getString(claim.resource_id);

          if (affectsReputation === "affected") {
            affectedCount++;
            messageCount = await getMessageCount(claimId, resource, resourceId, mlUserId, accessToken);
          }

          const resolution = getObject(claim.resolution);

          // Upsert
          await query(
            `INSERT INTO mercado_livre_claims (
              id, user_id, ml_user_id, resource_id, status, type, stage, reason_id,
              resource, date_created, last_updated, resolution_reason, resolution_closed_by,
              affects_reputation, has_incentive, due_date, message_count, synced_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
            ON CONFLICT (id) DO UPDATE SET
              status = EXCLUDED.status,
              stage = EXCLUDED.stage,
              last_updated = EXCLUDED.last_updated,
              resolution_reason = EXCLUDED.resolution_reason,
              resolution_closed_by = EXCLUDED.resolution_closed_by,
              affects_reputation = EXCLUDED.affects_reputation,
              has_incentive = EXCLUDED.has_incentive,
              due_date = EXCLUDED.due_date,
              message_count = EXCLUDED.message_count,
              synced_at = NOW()
            `,
            [
              claimId,
              userId,
              mlUserId,
              String(resourceId ?? ""),
              getString(claim.status) ?? "",
              getString(claim.type) ?? "",
              getString(claim.stage) ?? "",
              getString(claim.reason_id),
              resource,
              getString(claim.date_created) ?? "",
              claimLastUpdated,
              getString(resolution.reason),
              getString(resolution.closed_by),
              affectsReputation,
              hasIncentive,
              dueDate,
              messageCount,
            ]
          );

          synced++;
        })
      );
    }

    return NextResponse.json({
      success: true,
      total_from_ml: allClaims.length,
      synced,
      skipped,
      affected_count: affectedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    console.error("Erro no sync de claims ML:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
