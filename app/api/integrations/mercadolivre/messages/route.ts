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

type ParsedMessage = {
  id: string;
  text: string | null;
  status: string | null;
  from_user_id: number | null;
  to_user_id: number | null;
  created_at: string | null;
  received_at: string | null;
  read_at: string | null;
  available_at: string | null;
  notified_at: string | null;
  message_type: string | null;
  message_source: string | null;
  moderation_status: string | null;
  moderation_reason: string | null;
  attachments_count: number;
  attachments: { id: string | null, filename: string | null }[];
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

function parseMessage(raw: unknown): ParsedMessage {
  const obj = getObject(raw);
  const from = getObject(obj.from);
  const to = getObject(obj.to);
  const messageDate = getObject(obj.message_date);
  const moderation = getObject(obj.message_moderation);
  const attachments = Array.isArray(obj.attachments) ? obj.attachments : [];

  return {
    id: getString(obj.id) || "",
    text: getString(obj.text),
    status: getString(obj.status),
    from_user_id: getNumber(from.user_id),
    to_user_id: getNumber(to.user_id),
    created_at: getString(messageDate.created),
    received_at: getString(messageDate.received),
    read_at: getString(messageDate.read),
    available_at: getString(messageDate.available),
    notified_at: getString(messageDate.notified),
    message_type: getString(obj.message_type),
    message_source: getString(obj.message_source),
    moderation_status: getString(moderation.status),
    moderation_reason: getString(moderation.reason),
    attachments_count: attachments.length,
    attachments: attachments.map(a => {
      const ao = getObject(a);
      return { 
        id: getString(ao.id) || getString(ao.attachment_id), 
        filename: getString(ao.filename) || getString(ao.original_filename) 
      };
    })
  };
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
    const packId = searchParams.get("pack_id");
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");

    if (!mlUserId || !packId) {
      return NextResponse.json(
        { error: "ml_user_id e pack_id sao obrigatorios" },
        { status: 400 }
      );
    }

    const limit = Math.min(Math.max(Number(limitParam || 20), 1), 50);
    const offset = Math.max(Number(offsetParam || 0), 0);

    const credential = await getValidCredential(decoded.userId, mlUserId);
    const path = `/packs/${packId}/sellers/${mlUserId}`;
    const threadData = (await fetchMlJson(
      `https://api.mercadolibre.com/messages${path}?tag=post_sale&limit=${limit}&offset=${offset}`,
      credential.access_token
    )) as Record<string, unknown>;

    const paging = getObject(threadData.paging);
    const conversationStatus = getObject(threadData.conversation_status);
    const rawMessages = Array.isArray(threadData.messages) ? threadData.messages : [];
    const messages = rawMessages.map(parseMessage);

    return NextResponse.json({
      pack_id: packId,
      path,
      paging: {
        limit: getNumber(paging.limit) ?? limit,
        offset: getNumber(paging.offset) ?? offset,
        total: getNumber(paging.total) ?? messages.length,
      },
      conversation_status: {
        status: getString(conversationStatus.status),
        substatus: getString(conversationStatus.substatus),
        status_date: getString(conversationStatus.status_date),
        status_update_allowed:
          typeof conversationStatus.status_update_allowed === "boolean"
            ? conversationStatus.status_update_allowed
            : null,
        claim_ids: Array.isArray(conversationStatus.claim_ids)
          ? conversationStatus.claim_ids
              .map((value) => getNumber(value))
              .filter((value): value is number => value !== null)
          : [],
      },
      messages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    const status = message.includes("Conta nao conectada") ? 404 : 500;
    console.error("Erro ao buscar mensagens ML:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
