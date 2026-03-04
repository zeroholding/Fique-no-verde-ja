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

type ParsedClaimMessage = {
  id: string;
  sender_role: string | null;
  receiver_role: string | null;
  from_user_id: number | null;
  to_user_id: number | null;
  text: string | null;
  date_created: string | null;
  last_updated: string | null;
  status: string | null;
  attachments: Array<{
    filename: string | null;
    original_filename: string | null;
    type: string | null;
    size: number | null;
  }>;
};

function parseClaimMessage(raw: unknown): ParsedClaimMessage {
  const obj = getObject(raw);
  const sender = getObject(obj.sender);
  const receiver = getObject(obj.receiver);
  const attachments = Array.isArray(obj.attachments) ? obj.attachments : [];

  return {
    id: getString(obj.id) || "",
    sender_role: getString(sender.role),
    receiver_role: getString(receiver.role),
    from_user_id: getNumber(sender.user_id),
    to_user_id: getNumber(receiver.user_id),
    text: getString(obj.message),
    date_created: getString(obj.date_created),
    last_updated: getString(obj.last_updated),
    status: getString(obj.status),
    attachments: attachments.map((att: unknown) => {
      const a = getObject(att);
      return {
        filename: getString(a.filename),
        original_filename: getString(a.original_filename),
        type: getString(a.type),
        size: getNumber(a.size),
      };
    }),
  };
}

/**
 * GET /api/integrations/mercadolivre/claim-messages?ml_user_id=XYZ&claim_id=123&limit=50&offset=0
 *
 * Fetches the message history for a specific claim.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const { searchParams } = new URL(request.url);
    const mlUserId = searchParams.get("ml_user_id");
    const claimId = searchParams.get("claim_id");

    if (!mlUserId || !claimId) {
      return NextResponse.json({ error: "ml_user_id e claim_id sao obrigatorios" }, { status: 400 });
    }

    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 50), 1), 100);
    const offset = Math.max(Number(searchParams.get("offset") || 0), 0);

    const credential = await getValidCredential(decoded.userId, mlUserId);

    // Fetch all pages of messages for this claim
    let allMessages: ParsedClaimMessage[] = [];
    let currentOffset = offset;
    let totalMessages = 0;
    let pageCount = 0;

    while (true) {
      const data = (await fetchMlJson(
        `https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}/messages?limit=${limit}&offset=${currentOffset}`,
        credential.access_token
      )) as Record<string, unknown>;

      const paging = getObject(data.paging);
      totalMessages = getNumber(paging.total) ?? 0;
      const rawMessages = Array.isArray(data.data) ? data.data : [];

      if (rawMessages.length === 0) break;

      allMessages = allMessages.concat(rawMessages.map(parseClaimMessage));

      const pageLimit = getNumber(paging.limit) ?? limit;
      const pageOffset = getNumber(paging.offset) ?? currentOffset;
      const nextOffset = pageOffset + pageLimit;

      if (nextOffset >= totalMessages) break;
      currentOffset = nextOffset;
      pageCount++;
      if (pageCount >= 40) break; // safety
    }

    // Sort messages chronologically (oldest first)
    allMessages.sort((a, b) => {
      const aDate = Date.parse(a.date_created || "");
      const bDate = Date.parse(b.date_created || "");
      return (Number.isNaN(aDate) ? 0 : aDate) - (Number.isNaN(bDate) ? 0 : bDate);
    });

    return NextResponse.json({
      claim_id: claimId,
      total: Math.max(totalMessages, allMessages.length),
      messages: allMessages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    const status = message.includes("Conta nao conectada") ? 404 : 500;
    console.error("Erro ao buscar mensagens da claim ML:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
