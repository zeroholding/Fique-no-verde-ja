import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const ML_APP_ID = process.env.MERCADO_LIVRE_APP_ID;
const ML_SECRET_KEY = process.env.MERCADO_LIVRE_SECRET_KEY;

type MlClaim = {
  id: number;
  status: string;
  type: string;
  stage: string;
  reason_id: string | null;
  resource: string | null;
  resource_id: number | string | null;
  date_created: string;
  last_updated: string;
  resolution_reason: string | null;
  resolution_closed_by: string | null;
};

type MlMessageThread = {
  path: string;
  pack_id: string | null;
  unread_count: number;
  status: string | null;
  substatus: string | null;
  claim_ids: number[];
  total_messages: number;
  last_message_date: string | null;
  last_message_from: number | null;
  last_message_text: string | null;
};

function parsePackIdFromPath(path: string): string | null {
  const match = path.match(/\/packs\/(\d+)\/sellers\/\d+/);
  return match?.[1] || null;
}

function normalizeClaim(claim: any): MlClaim {
  return {
    id: claim.id,
    status: claim.status,
    type: claim.type,
    stage: claim.stage,
    reason_id: claim.reason_id || null,
    resource: claim.resource || null,
    resource_id: claim.resource_id ?? null,
    date_created: claim.date_created,
    last_updated: claim.last_updated,
    resolution_reason: claim.resolution?.reason || null,
    resolution_closed_by: claim.resolution?.closed_by || null,
  };
}

async function fetchMlJson(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ML ${response.status} at ${url}: ${errorBody}`);
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

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const userId = decoded.userId;
    const { searchParams } = new URL(request.url);
    const requestedMlUserId = searchParams.get("ml_user_id");

    let result;
    if (requestedMlUserId) {
      result = await query(
        "SELECT * FROM mercado_livre_credentials WHERE user_id = $1 AND ml_user_id = $2",
        [userId, requestedMlUserId]
      );
    } else {
      result = await query(
        "SELECT * FROM mercado_livre_credentials WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1",
        [userId]
      );
    }

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Conta nao conectada" }, { status: 404 });
    }

    let { access_token, refresh_token, expires_at, ml_user_id } = result.rows[0];

    const expirationDate = new Date(expires_at);
    const now = new Date();
    const fiveMinutesMs = 5 * 60 * 1000;

    if (now.getTime() + fiveMinutesMs > expirationDate.getTime()) {
      try {
        const newTokenData = await refreshAccessToken(refresh_token);
        access_token = newTokenData.access_token;
        refresh_token = newTokenData.refresh_token;
        const newExpiresAt = new Date();
        newExpiresAt.setSeconds(newExpiresAt.getSeconds() + newTokenData.expires_in);

        await query(
          `UPDATE mercado_livre_credentials
           SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW()
           WHERE user_id = $4 AND ml_user_id = $5`,
          [access_token, refresh_token, newExpiresAt.toISOString(), userId, ml_user_id]
        );
      } catch (refreshError) {
        console.error("Erro ao atualizar token:", refreshError);
        return NextResponse.json(
          { error: "Sessao do Mercado Livre expirada. Por favor, reconecte." },
          { status: 401 }
        );
      }
    }

    const mlData = await fetchMlJson(
      `https://api.mercadolibre.com/users/${ml_user_id}`,
      access_token
    );

    let totalSales60d: number | null = null;
    try {
      const baseDate = new Date();
      baseDate.setDate(baseDate.getDate() - 1);
      const dateFrom = new Date(baseDate);
      dateFrom.setDate(baseDate.getDate() - 59);
      dateFrom.setHours(0, 0, 0, 0);

      const ordersData = await fetchMlJson(
        `https://api.mercadolibre.com/orders/search?seller=${ml_user_id}&order.date_created.from=${dateFrom.toISOString()}&limit=1`,
        access_token
      );
      totalSales60d = Number(ordersData?.paging?.total ?? 0);
    } catch (error) {
      console.warn("Falha ao buscar total de vendas no periodo:", error);
    }

    let claimsOpenedCount = 0;
    let claimsOpened: MlClaim[] = [];
    let claimsRecent: MlClaim[] = [];

    try {
      const openedClaimsData = await fetchMlJson(
        `https://api.mercadolibre.com/post-purchase/v1/claims/search?player_role=respondent&player_user_id=${ml_user_id}&status=opened&sort=last_updated:desc&limit=10`,
        access_token
      );
      claimsOpened = (openedClaimsData.data || []).map(normalizeClaim);
      claimsOpenedCount = Number(openedClaimsData?.paging?.total ?? claimsOpened.length);
    } catch (error) {
      console.warn("Falha ao buscar claims abertas:", error);
    }

    try {
      const recentClaimsData = await fetchMlJson(
        `https://api.mercadolibre.com/post-purchase/v1/claims/search?player_role=respondent&player_user_id=${ml_user_id}&sort=last_updated:desc&limit=10`,
        access_token
      );
      claimsRecent = (recentClaimsData.data || []).map(normalizeClaim);
    } catch (error) {
      console.warn("Falha ao buscar claims recentes:", error);
    }

    let unreadTotal = 0;
    let messageThreads: MlMessageThread[] = [];

    try {
      const unreadData = await fetchMlJson(
        "https://api.mercadolibre.com/messages/unread?role=seller&tag=post_sale",
        access_token
      );

      unreadTotal = Number(unreadData?.total ?? 0);
      const unreadResults = Array.isArray(unreadData?.results) ? unreadData.results : [];
      const unreadEntries = unreadResults
        .map((entry: any) => ({
          path: String(entry.resource || ""),
          packId: parsePackIdFromPath(String(entry.resource || "")),
          unreadCount: Number(entry.count ?? 0),
        }))
        .filter((entry: { path: string; packId: string | null; unreadCount: number }) => !!entry.packId)
        .sort((a: { unreadCount: number }, b: { unreadCount: number }) => b.unreadCount - a.unreadCount);

      const unreadMap = new Map<string, number>(
        unreadEntries.map((entry: { path: string; unreadCount: number }) => [entry.path, entry.unreadCount])
      );

      const recentOrdersData = await fetchMlJson(
        `https://api.mercadolibre.com/orders/search?seller=${ml_user_id}&sort=date_desc&limit=20`,
        access_token
      );

      const packCandidates: Array<{ packId: string; path: string }> = [];
      const seenPaths = new Set<string>();
      const maxThreads = 12;

      for (const entry of unreadEntries) {
        if (!entry.packId) continue;
        if (seenPaths.has(entry.path)) continue;
        seenPaths.add(entry.path);
        packCandidates.push({ packId: entry.packId, path: entry.path });
        if (packCandidates.length >= maxThreads) break;
      }

      for (const order of recentOrdersData?.results || []) {
        if (packCandidates.length >= maxThreads) break;
        const packId = order?.pack_id ? String(order.pack_id) : null;
        if (!packId) continue;
        const path = `/packs/${packId}/sellers/${ml_user_id}`;
        if (seenPaths.has(path)) continue;
        seenPaths.add(path);
        packCandidates.push({ packId, path });
      }

      const threadResults = await Promise.all(
        packCandidates.map(async ({ packId, path }) => {
          try {
            const threadData = await fetchMlJson(
              `https://api.mercadolibre.com/messages${path}?tag=post_sale&limit=20&offset=0`,
              access_token
            );

            const messages = Array.isArray(threadData?.messages) ? threadData.messages : [];
            const sortedMessages = [...messages].sort((a: any, b: any) => {
              const aDate = Date.parse(a?.message_date?.created || a?.message_date?.received || "");
              const bDate = Date.parse(b?.message_date?.created || b?.message_date?.received || "");
              return bDate - aDate;
            });
            const lastMessage = sortedMessages[0];

            return {
              path,
              pack_id: packId,
              unread_count: unreadMap.get(path) ?? 0,
              status: threadData?.conversation_status?.status ?? null,
              substatus: threadData?.conversation_status?.substatus ?? null,
              claim_ids: threadData?.conversation_status?.claim_ids ?? [],
              total_messages: Number(threadData?.paging?.total ?? messages.length),
              last_message_date:
                lastMessage?.message_date?.created ||
                lastMessage?.message_date?.received ||
                null,
              last_message_from: lastMessage?.from?.user_id ?? null,
              last_message_text:
                typeof lastMessage?.text === "string"
                  ? lastMessage.text.slice(0, 160)
                  : null,
            } as MlMessageThread;
          } catch (error) {
            console.warn(`Falha ao buscar mensagens do pack ${packId}:`, error);
            return null;
          }
        })
      );

      messageThreads = threadResults
        .filter((thread): thread is MlMessageThread => thread !== null)
        .filter((thread) => {
          const isBlockedEmpty =
            thread.status === "blocked" &&
            thread.unread_count === 0 &&
            thread.total_messages === 0;
          return !isBlockedEmpty;
        })
        .sort((a, b) => {
          if (b.unread_count !== a.unread_count) {
            return b.unread_count - a.unread_count;
          }
          const aDate = a.last_message_date ? Date.parse(a.last_message_date) : 0;
          const bDate = b.last_message_date ? Date.parse(b.last_message_date) : 0;
          return bDate - aDate;
        });
    } catch (error) {
      console.warn("Falha ao buscar mensagens pos-venda:", error);
    }

    return NextResponse.json({
      nickname: mlData.nickname,
      permalink: mlData.permalink,
      seller_reputation: mlData.seller_reputation,
      registration_date: mlData.registration_date,
      status: mlData.status,
      thumbnail: mlData.thumbnail,
      site_id: mlData.site_id,
      points: mlData.points,
      total_sales_period: totalSales60d,
      support: {
        claims: {
          opened_count: claimsOpenedCount,
          opened: claimsOpened,
          recent: claimsRecent,
        },
        messages: {
          unread_total: unreadTotal,
          threads: messageThreads,
        },
      },
    });
  } catch (error) {
    console.error("Erro interno:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
