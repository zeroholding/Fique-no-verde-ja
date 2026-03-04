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

type NormalizedMessage = {
  id: string;
  sender_role: string | null;
  receiver_role: string | null;
  from_user_id: number | null;
  to_user_id: number | null;
  text: string | null;
  date_created: string | null;
  last_updated: string | null;
  status: string | null;
  source: "claim" | "pack";
  attachments: Array<{
    filename: string | null;
    original_filename: string | null;
    type: string | null;
    size: number | null;
  }>;
};

// Parse messages from /post-purchase/v1/claims/{id}/messages
function parseClaimMessage(raw: unknown): NormalizedMessage {
  const obj = getObject(raw);
  const sender = getObject(obj.sender);
  const receiver = getObject(obj.receiver);
  const attachments = Array.isArray(obj.attachments) ? obj.attachments : [];

  return {
    id: getString(obj.id) || String(Math.random()),
    sender_role: getString(sender.role),
    receiver_role: getString(receiver.role),
    from_user_id: getNumber(sender.user_id),
    to_user_id: getNumber(receiver.user_id),
    text: getString(obj.message),
    date_created: getString(obj.date_created),
    last_updated: getString(obj.last_updated),
    status: getString(obj.status),
    source: "claim",
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

// Parse messages from /messages/packs/{packId}/sellers/{sellerId}
function parsePackMessage(raw: unknown): NormalizedMessage {
  const obj = getObject(raw);
  const from = getObject(obj.from);
  const to = getObject(obj.to);
  const messageDate = getObject(obj.message_date);
  const attachments = Array.isArray(obj.attachments) ? obj.attachments : [];

  return {
    id: getString(obj.id) || String(Math.random()),
    sender_role: null,
    receiver_role: null,
    from_user_id: getNumber(from.user_id),
    to_user_id: getNumber(to.user_id),
    text: getString(obj.text),
    date_created: getString(messageDate.created) || getString(messageDate.received),
    last_updated: null,
    status: getString(obj.status),
    source: "pack",
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
 * GET /api/integrations/mercadolivre/claim-messages?ml_user_id=XYZ&claim_id=123
 *
 * Strategy:
 *  1. Try /post-purchase/v1/claims/{id}/messages (claim-level messages)
 *  2. If empty, get claim detail to find resource_id (shipment/order)
 *  3. From shipment, get pack_id/order_id
 *  4. Fetch /messages/packs/{packId}/sellers/{sellerId} (post-sale messages)
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

    const credential = await getValidCredential(decoded.userId, mlUserId);
    const accessToken = credential.access_token;

    // ── Step 1: Try claim-level messages ──
    let allMessages: NormalizedMessage[] = [];
    let messageSource = "claim";

    try {
      let currentOffset = 0;
      const limit = 50;
      let totalMessages = 0;
      let pageCount = 0;

      while (true) {
        const data = (await fetchMlJson(
          `https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}/messages?limit=${limit}&offset=${currentOffset}`,
          accessToken
        )) as Record<string, unknown>;

        const paging = getObject(data.paging);
        totalMessages = getNumber(paging.total) ?? 0;
        
        // Try both "data" and "messages" fields  
        const rawMessages = Array.isArray(data.data)
          ? data.data
          : Array.isArray(data.messages)
          ? data.messages
          : [];

        if (rawMessages.length === 0) break;

        allMessages = allMessages.concat(rawMessages.map(parseClaimMessage));

        const pageLimit = getNumber(paging.limit) ?? limit;
        const pageOffset = getNumber(paging.offset) ?? currentOffset;
        const nextOffset = pageOffset + pageLimit;

        if (nextOffset >= totalMessages) break;
        currentOffset = nextOffset;
        pageCount++;
        if (pageCount >= 40) break;
      }
    } catch (err) {
      console.warn("Claim messages fetch failed:", err);
    }

    // ── Step 2: If no claim messages found, try via pack/order ──
    if (allMessages.length === 0) {
      messageSource = "pack";

      try {
        // Get claim details to find resource_id  
        const claimData = await fetchMlJsonSafe(
          `https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}`,
          accessToken
        );

        if (claimData) {
          const resource = getString(claimData.resource);
          const resourceId = getNumber(claimData.resource_id) ?? getString(claimData.resource_id);

          let packId: string | null = null;

          if (resource === "shipment" && resourceId) {
            // From shipment, get pack_id or order_id
            const shipmentData = await fetchMlJsonSafe(
              `https://api.mercadolibre.com/shipments/${resourceId}`,
              accessToken
            );
            if (shipmentData) {
              packId = getString(shipmentData.pack_id) || String(getNumber(shipmentData.order_id) ?? "");
            }
          } else if (resource === "order" && resourceId) {
            // From order, get pack_id
            const orderData = await fetchMlJsonSafe(
              `https://api.mercadolibre.com/orders/${resourceId}`,
              accessToken
            );
            if (orderData) {
              packId = getString(orderData.pack_id) || String(resourceId);
            }
          }

          if (packId) {
            // Fetch post-sale pack messages
            let currentOffset = 0;
            const limit = 50;
            let pageCount = 0;

            while (true) {
              const threadData = await fetchMlJsonSafe(
                `https://api.mercadolibre.com/messages/packs/${packId}/sellers/${mlUserId}?tag=post_sale&limit=${limit}&offset=${currentOffset}`,
                accessToken
              );

              if (!threadData) break;

              const rawMessages = Array.isArray(threadData.messages) ? threadData.messages : [];
              if (rawMessages.length === 0) break;

              allMessages = allMessages.concat(rawMessages.map(parsePackMessage));

              const paging = getObject(threadData.paging);
              const pageLimit = getNumber(paging.limit) ?? limit;
              const pageOffset = getNumber(paging.offset) ?? currentOffset;
              const total = getNumber(paging.total) ?? 0;
              const nextOffset = pageOffset + pageLimit;

              if (nextOffset >= total) break;
              currentOffset = nextOffset;
              pageCount++;
              if (pageCount >= 40) break;
            }
          }
        }
      } catch (err) {
        console.warn("Pack messages fallback failed:", err);
      }
    }

    // Sort chronologically (oldest first)
    allMessages.sort((a, b) => {
      const aDate = Date.parse(a.date_created || "");
      const bDate = Date.parse(b.date_created || "");
      return (Number.isNaN(aDate) ? 0 : aDate) - (Number.isNaN(bDate) ? 0 : bDate);
    });

    return NextResponse.json({
      claim_id: claimId,
      total: allMessages.length,
      source: messageSource,
      messages: allMessages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    const status = message.includes("Conta nao conectada") ? 404 : 500;
    console.error("Erro ao buscar mensagens da claim ML:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
