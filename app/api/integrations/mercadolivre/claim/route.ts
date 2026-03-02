import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const ML_APP_ID = process.env.MERCADO_LIVRE_APP_ID;
const ML_SECRET_KEY = process.env.MERCADO_LIVRE_SECRET_KEY;

type JwtPayload = {
  userId: string;
};

type CredentialRow = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  ml_user_id: string | number;
};

function getNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

async function fetchMlJson(url: string, accessToken: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
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

  if (!response.ok) {
    throw new Error("Falha ao atualizar token");
  }

  return response.json();
}

async function getValidCredential(userId: string, mlUserId: string): Promise<CredentialRow> {
  const result = await query(
    "SELECT access_token, refresh_token, expires_at, ml_user_id FROM mercado_livre_credentials WHERE user_id = $1 AND ml_user_id = $2 LIMIT 1",
    [userId, mlUserId]
  );

  if (result.rows.length === 0) {
    throw new Error("Conta nao conectada");
  }

  const credential = result.rows[0] as CredentialRow;
  const expirationDate = new Date(credential.expires_at);
  const now = new Date();
  const fiveMinutesMs = 5 * 60 * 1000;

  if (now.getTime() + fiveMinutesMs <= expirationDate.getTime()) {
    return credential;
  }

  const refreshed = await refreshAccessToken(credential.refresh_token);
  const newAccessToken = getString((refreshed as Record<string, unknown>).access_token);
  const newRefreshToken =
    getString((refreshed as Record<string, unknown>).refresh_token) || credential.refresh_token;
  const expiresIn = getNumber((refreshed as Record<string, unknown>).expires_in) || 0;

  if (!newAccessToken) {
    throw new Error("Falha ao atualizar token de acesso");
  }

  const newExpiresAt = new Date();
  newExpiresAt.setSeconds(newExpiresAt.getSeconds() + expiresIn);

  await query(
    `UPDATE mercado_livre_credentials
     SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW()
     WHERE user_id = $4 AND ml_user_id = $5`,
    [newAccessToken, newRefreshToken, newExpiresAt.toISOString(), userId, mlUserId]
  );

  return {
    ...credential,
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    expires_at: newExpiresAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const { searchParams } = new URL(request.url);
    const mlUserId = searchParams.get("ml_user_id");
    const claimId = searchParams.get("claim_id");

    if (!mlUserId || !claimId) {
      return NextResponse.json(
        { error: "ml_user_id e claim_id sao obrigatorios" },
        { status: 400 }
      );
    }

    const credential = await getValidCredential(decoded.userId, mlUserId);
    const claim = (await fetchMlJson(
      `https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}`,
      credential.access_token
    )) as Record<string, unknown>;

    const resolution = getObject(claim.resolution);
    const players = Array.isArray(claim.players) ? claim.players : [];
    const relatedEntities = Array.isArray(claim.related_entities) ? claim.related_entities : [];
    const cancelDetailObj = getObject(claim.cancel_detail);
    const cancelDetailString =
      Object.keys(cancelDetailObj).length > 0 ? JSON.stringify(cancelDetailObj) : getString(claim.cancel_detail);

    return NextResponse.json({
      claim: {
        id: getNumber(claim.id),
        status: getString(claim.status),
        type: getString(claim.type),
        stage: getString(claim.stage),
        resource: getString(claim.resource),
        resource_id: getNumber(claim.resource_id) ?? getString(claim.resource_id),
        reason_id: getString(claim.reason_id),
        fulfilled: typeof claim.fulfilled === "boolean" ? claim.fulfilled : null,
        quantity_type: getString(claim.quantity_type),
        claimed_quantity: getNumber(claim.claimed_quantity),
        parent_id: getNumber(claim.parent_id),
        claim_version: getNumber(claim.claim_version),
        date_created: getString(claim.date_created),
        last_updated: getString(claim.last_updated),
        site_id: getString(claim.site_id),
        cancel_detail: cancelDetailString,
        resolution_reason: getString(resolution.reason),
        resolution_date: getString(resolution.date_created),
        resolution_closed_by: getString(resolution.closed_by),
        resolution_applied_coverage:
          typeof resolution.applied_coverage === "boolean" ? resolution.applied_coverage : null,
        resolution_benefited: Array.isArray(resolution.benefited)
          ? resolution.benefited
              .map((value) => getString(value))
              .filter((value): value is string => value !== null)
          : [],
        players: players.map((player) => {
          const p = getObject(player);
          const availableActions = Array.isArray(p.available_actions) ? p.available_actions : [];
          return {
            role: getString(p.role),
            type: getString(p.type),
            user_id: getNumber(p.user_id),
            available_actions: availableActions
              .map((value) => getString(value))
              .filter((value): value is string => value !== null),
          };
        }),
        related_entities: relatedEntities.map((entity) => {
          const related = getObject(entity);
          return {
            type: getString(related.type),
            id: getNumber(related.id) ?? getString(related.id),
            role: getString(related.role),
            status: getString(related.status),
          };
        }),
      },
      raw: claim,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    const status = message.includes("Conta nao conectada") ? 404 : 500;
    console.error("Erro ao buscar claim ML:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
