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
  sender_role: string | null; // "seller" | "buyer" | "mediator" | "system"
  receiver_role: string | null;
  from_user_id: number | null;
  to_user_id: number | null;
  text: string | null;
  date_created: string | null;
  last_updated: string | null;
  status: string | null;
  source: "claim" | "pack";
  attachments: Array<{
    id: string | null;
    filename: string | null;
    original_filename: string | null;
    type: string | null;
    size: number | null;
  }>;
};

// Map ML claim roles to our standard roles
function normalizeClaimRole(role: string | null): string | null {
  if (!role) return null;
  switch (role) {
    case "complainant": return "buyer";
    case "respondent": return "seller";
    case "mediator": return "mediator";
    default: return role;
  }
}

// Parse messages from /post-purchase/v1/claims/{id}/messages
function parseClaimMessage(raw: unknown): NormalizedMessage {
  const obj = getObject(raw);
  const sender = getObject(obj.sender);
  const receiver = getObject(obj.receiver);
  const attachments = Array.isArray(obj.attachments) ? obj.attachments : [];

  return {
    id: getString(obj.id) || String(Math.random()),
    sender_role: normalizeClaimRole(getString(sender.role)),
    receiver_role: normalizeClaimRole(getString(receiver.role)),
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
        id: getString(a.id) || getString(a.attachment_id),
        filename: getString(a.filename),
        original_filename: getString(a.original_filename),
        type: getString(a.type),
        size: getNumber(a.size),
      };
    }),
  };
}

// Parse messages from /messages/packs/{packId}/sellers/{sellerId}
// mlUserIdNum is used to determine if message was sent by seller
function parsePackMessage(raw: unknown, mlUserIdNum: number): NormalizedMessage {
  const obj = getObject(raw);
  const from = getObject(obj.from);
  const to = getObject(obj.to);
  const messageDate = getObject(obj.message_date);
  const attachments = Array.isArray(obj.attachments) ? obj.attachments : [];

  const fromUserId = getNumber(from.user_id);
  const toUserId = getNumber(to.user_id);

  // Determine sender role by comparing user IDs
  let senderRole: string | null = null;
  if (fromUserId === mlUserIdNum) {
    senderRole = "seller";
  } else if (fromUserId !== null) {
    senderRole = "buyer";
  }

  let receiverRole: string | null = null;
  if (toUserId === mlUserIdNum) {
    receiverRole = "seller";
  } else if (toUserId !== null) {
    receiverRole = "buyer";
  }

  return {
    id: getString(obj.id) || String(Math.random()),
    sender_role: senderRole,
    receiver_role: receiverRole,
    from_user_id: fromUserId,
    to_user_id: toUserId,
    text: getString(obj.text),
    date_created: getString(messageDate.created) || getString(messageDate.received),
    last_updated: null,
    status: getString(obj.status),
    source: "pack",
    attachments: attachments.map((att: unknown) => {
      const a = getObject(att);
      return {
        id: getString(a.id) || getString(a.attachment_id),
        filename: getString(a.filename),
        original_filename: getString(a.original_filename),
        type: getString(a.type),
        size: getNumber(a.size),
      };
    }),
  };
}

// ── Auto-create messages cache table ──
async function ensureMessagesTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS mercado_livre_claim_messages (
      id VARCHAR(100) NOT NULL,
      claim_id BIGINT NOT NULL,
      ml_user_id VARCHAR(50) NOT NULL,
      sender_role VARCHAR(20),
      receiver_role VARCHAR(20),
      from_user_id BIGINT,
      to_user_id BIGINT,
      text TEXT,
      date_created VARCHAR(50),
      last_updated VARCHAR(50),
      status VARCHAR(20),
      source VARCHAR(10),
      attachments_json TEXT DEFAULT '[]',
      cached_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, claim_id)
    );
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_ml_claim_msgs_claim
    ON mercado_livre_claim_messages (claim_id, ml_user_id);
  `);
}

/**
 * GET /api/integrations/mercadolivre/claim-messages?ml_user_id=XYZ&claim_id=123
 *
 * Strategy:
 *  1. Check local DB cache first
 *  2. If no cache, fetch from ML API
 *  3. Cache the results into DB
 *  4. Return messages with proper sender_role
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const { searchParams } = new URL(request.url);
    const mlUserId = searchParams.get("ml_user_id");
    const claimId = searchParams.get("claim_id");
    const forceRefresh = searchParams.get("refresh") === "true";

    if (!mlUserId || !claimId) {
      return NextResponse.json({ error: "ml_user_id e claim_id sao obrigatorios" }, { status: 400 });
    }

    await ensureMessagesTable();

    const mlUserIdNum = Number(mlUserId);

    // ── Step 0: Check DB cache ──
    if (!forceRefresh) {
      try {
        const cachedResult = await query(
          "SELECT * FROM mercado_livre_claim_messages WHERE claim_id = $1 AND ml_user_id = $2 ORDER BY date_created ASC",
          [claimId, mlUserId]
        );
        if (cachedResult.rows.length > 0) {
          const cachedMessages: NormalizedMessage[] = cachedResult.rows.map((row: Record<string, unknown>) => ({
            id: String(row.id),
            sender_role: getString(row.sender_role),
            receiver_role: getString(row.receiver_role),
            from_user_id: getNumber(row.from_user_id),
            to_user_id: getNumber(row.to_user_id),
            text: getString(row.text),
            date_created: getString(row.date_created),
            last_updated: getString(row.last_updated),
            status: getString(row.status),
            source: (getString(row.source) as "claim" | "pack") || "claim",
            attachments: JSON.parse(String(row.attachments_json || "[]")),
          }));

          return NextResponse.json({
            claim_id: claimId,
            ml_user_id: mlUserIdNum,
            total: cachedMessages.length,
            source: "cache",
            messages: cachedMessages,
          });
        }
      } catch {
        // Table might not exist yet, continue to fetch
      }
    }

    // ── Step 1: Fetch from ML API ──
    const credential = await getValidCredential(decoded.userId, mlUserId);
    const accessToken = credential.access_token;

    let allMessages: NormalizedMessage[] = [];
    let messageSource = "claim";

    // Try claim-level messages
    try {
      let currentOffset = 0;
      const limit = 50;
      let pageCount = 0;

      while (true) {
        const data = (await fetchMlJson(
          `https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}/messages?limit=${limit}&offset=${currentOffset}`,
          accessToken
        )) as Record<string, unknown>;

        const paging = getObject(data.paging);
        const totalMessages = getNumber(paging.total) ?? 0;
        
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

    // If no claim messages, try via pack/order
    if (allMessages.length === 0) {
      messageSource = "pack";

      try {
        const claimData = await fetchMlJsonSafe(
          `https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}`,
          accessToken
        );

        if (claimData) {
          const resource = getString(claimData.resource);
          const resourceId = getNumber(claimData.resource_id) ?? getString(claimData.resource_id);

          let packId: string | null = null;

          if (resource === "shipment" && resourceId) {
            const shipmentData = await fetchMlJsonSafe(
              `https://api.mercadolibre.com/shipments/${resourceId}`,
              accessToken
            );
            if (shipmentData) {
              packId = getString(shipmentData.pack_id) || String(getNumber(shipmentData.order_id) ?? "");
            }
          } else if (resource === "order" && resourceId) {
            const orderData = await fetchMlJsonSafe(
              `https://api.mercadolibre.com/orders/${resourceId}`,
              accessToken
            );
            if (orderData) {
              packId = getString(orderData.pack_id) || String(resourceId);
            }
          }

          if (packId) {
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

              allMessages = allMessages.concat(rawMessages.map((m: unknown) => parsePackMessage(m, mlUserIdNum)));

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

    // ── Step 2: Cache messages in DB ──
    if (allMessages.length > 0) {
      try {
        // Delete old cache for this claim
        await query(
          "DELETE FROM mercado_livre_claim_messages WHERE claim_id = $1 AND ml_user_id = $2",
          [claimId, mlUserId]
        );

        // Insert new messages
        for (const msg of allMessages) {
          await query(
            `INSERT INTO mercado_livre_claim_messages (
              id, claim_id, ml_user_id, sender_role, receiver_role,
              from_user_id, to_user_id, text, date_created, last_updated,
              status, source, attachments_json, cached_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
            ON CONFLICT (id, claim_id) DO NOTHING`,
            [
              msg.id,
              claimId,
              mlUserId,
              msg.sender_role,
              msg.receiver_role,
              msg.from_user_id,
              msg.to_user_id,
              msg.text,
              msg.date_created,
              msg.last_updated,
              msg.status,
              msg.source,
              JSON.stringify(msg.attachments),
            ]
          );
        }
      } catch (cacheErr) {
        console.warn("Failed to cache messages:", cacheErr);
        // Non-fatal, continue returning the messages
      }
    }

    return NextResponse.json({
      claim_id: claimId,
      ml_user_id: mlUserIdNum,
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
