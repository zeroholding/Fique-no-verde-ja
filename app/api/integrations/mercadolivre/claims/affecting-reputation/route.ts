import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const ML_APP_ID = process.env.MERCADO_LIVRE_APP_ID;
const ML_SECRET_KEY = process.env.MERCADO_LIVRE_SECRET_KEY;

type JwtPayload = { userId: string };
type CredentialRow = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  ml_user_id: string | number;
};

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

async function fetchMlJson(url: string, accessToken: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ML ${response.status}: ${body}`);
  }
  return response.json();
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
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

// ── Normalized Claim type for the frontend ──
type AffectingClaim = {
  id: number;
  resource_id: number | string | null;
  status: string;
  type: string;
  stage: string;
  reason_id: string | null;
  resource: string | null;
  date_created: string;
  last_updated: string;
  resolution_reason: string | null;
  resolution_closed_by: string | null;
  affects_reputation: string;
  has_incentive: boolean;
  due_date: string | null;
};

/**
 * GET /api/integrations/mercadolivre/claims/affecting-reputation?ml_user_id=XYZ
 *
 * Fetches ALL claims from the last 60 days, checks each one via the
 * /affects-reputation endpoint, and returns only those that are "affected".
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const { searchParams } = new URL(request.url);
    const mlUserId = searchParams.get("ml_user_id");
    if (!mlUserId) return NextResponse.json({ error: "ml_user_id obrigatorio" }, { status: 400 });

    const credential = await getValidCredential(decoded.userId, mlUserId);
    const accessToken = credential.access_token;

    // 1. Fetch all recent claims with pagination
    const pageLimit = 50;
    const maxClaims = 500;
    type RawClaim = Record<string, unknown>;
    const allClaims: RawClaim[] = [];
    let offset = 0;

    while (true) {
      const claimsData = (await fetchMlJson(
        `https://api.mercadolibre.com/post-purchase/v1/claims/search?player_role=respondent&player_user_id=${mlUserId}&sort=last_updated:desc&limit=${pageLimit}&offset=${offset}`,
        accessToken
      )) as Record<string, unknown>;

      const rows = Array.isArray(claimsData?.data) ? claimsData.data : [];
      const total = Number((getObject(claimsData?.paging) as Record<string, unknown>)?.total ?? rows.length);

      for (const row of rows) {
        if (allClaims.length >= maxClaims) break;
        allClaims.push(getObject(row));
      }

      const currentLimit = Number((getObject(claimsData?.paging) as Record<string, unknown>)?.limit ?? pageLimit);
      const currentOffset = Number((getObject(claimsData?.paging) as Record<string, unknown>)?.offset ?? offset);
      const nextOffset = currentOffset + currentLimit;

      if (rows.length === 0 || nextOffset >= total || allClaims.length >= maxClaims) break;
      offset = nextOffset;
    }

    // 2. For each claim, check affects-reputation in parallel batches of 10
    const batchSize = 10;
    const affectingClaims: AffectingClaim[] = [];

    for (let i = 0; i < allClaims.length; i += batchSize) {
      const batch = allClaims.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (claim) => {
          const claimId = getNumber(claim.id);
          if (!claimId) return null;

          try {
            const repData = (await fetchMlJson(
              `https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}/affects-reputation`,
              accessToken
            )) as Record<string, unknown>;

            const affectsReputation = getString(repData.affects_reputation) ?? "unknown";

            if (affectsReputation === "affected") {
              const resolution = getObject(claim.resolution);
              return {
                id: claimId,
                resource_id: getNumber(claim.resource_id) ?? getString(claim.resource_id),
                status: getString(claim.status) ?? "",
                type: getString(claim.type) ?? "",
                stage: getString(claim.stage) ?? "",
                reason_id: getString(claim.reason_id),
                resource: getString(claim.resource),
                date_created: getString(claim.date_created) ?? "",
                last_updated: getString(claim.last_updated) ?? "",
                resolution_reason: getString(resolution.reason),
                resolution_closed_by: getString(resolution.closed_by),
                affects_reputation: affectsReputation,
                has_incentive: repData.has_incentive === true,
                due_date: getString(repData.due_date),
              } as AffectingClaim;
            }
            return null;
          } catch {
            return null;
          }
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          affectingClaims.push(result.value);
        }
      }
    }

    return NextResponse.json({
      total_claims_checked: allClaims.length,
      affecting_count: affectingClaims.length,
      claims: affectingClaims,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    const status = message.includes("Conta nao conectada") ? 404 : 500;
    console.error("Erro ao buscar claims afetando reputacao:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
