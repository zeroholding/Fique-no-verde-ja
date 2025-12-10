import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const ML_APP_ID = process.env.MERCADO_LIVRE_APP_ID;
const ML_SECRET_KEY = process.env.MERCADO_LIVRE_SECRET_KEY;

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
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
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const userId = decoded.userId;

    // Pega ml_user_id da query string (opcional)
    const { searchParams } = new URL(request.url);
    const requestedMlUserId = searchParams.get("ml_user_id");

    // Busca credenciais no banco
    let result;
    if (requestedMlUserId) {
      // Se ml_user_id foi especificado, busca essa conta específica
      result = await query(
        "SELECT * FROM mercado_livre_credentials WHERE user_id = $1 AND ml_user_id = $2",
        [userId, requestedMlUserId]
      );
    } else {
      // Se não especificado, busca a primeira conta
      result = await query(
        "SELECT * FROM mercado_livre_credentials WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1",
        [userId]
      );
    }

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Conta não conectada" }, { status: 404 });
    }

    let { access_token, refresh_token, expires_at, ml_user_id } = result.rows[0];

    // Verifica se o token expirou ou está prestes a expirar (menos de 5 minutos)
    const expirationDate = new Date(expires_at);
    const now = new Date();
    const fiveMinutes = 5 * 60 * 1000;

    if (now.getTime() + fiveMinutes > expirationDate.getTime()) {
      console.log("Token expirado ou expirando, atualizando...");
      try {
        const newTokenData = await refreshAccessToken(refresh_token);
        
        access_token = newTokenData.access_token;
        refresh_token = newTokenData.refresh_token; // ML pode retornar um novo refresh token
        const newExpiresIn = newTokenData.expires_in;
        const newExpiresAt = new Date();
        newExpiresAt.setSeconds(newExpiresAt.getSeconds() + newExpiresIn);

        // Atualiza no banco
        await query(
          `UPDATE mercado_livre_credentials 
           SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW() 
           WHERE user_id = $4`,
          [access_token, refresh_token, newExpiresAt.toISOString(), userId]
        );
      } catch (refreshError) {
        console.error("Erro ao atualizar token:", refreshError);
        return NextResponse.json({ error: "Sessão do Mercado Livre expirada. Por favor, reconecte." }, { status: 401 });
      }
    }

    // Busca dados de reputação do usuário
    const mlResponse = await fetch(`https://api.mercadolibre.com/users/${ml_user_id}`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!mlResponse.ok) {
      const errorData = await mlResponse.json();
      console.error("Erro API ML:", errorData);
      return NextResponse.json({ error: "Erro ao buscar dados do Mercado Livre" }, { status: mlResponse.status });
    }

    const mlData = await mlResponse.json();

    // Busca total de vendas nos últimos 60 dias (incluindo canceladas e não concretizadas)
    let totalSales60d = null;
    try {
      const today = new Date();
      // Retrocede 60 dias a partir de ontem (não hoje), para corresponder ao ML
      today.setDate(today.getDate() - 1);
      const sixtyDaysAgo = new Date(today);
      sixtyDaysAgo.setDate(today.getDate() - 59); // 59 + hoje = 60 dias
      // Ajusta para o início do dia (00:00:00)
      sixtyDaysAgo.setHours(0, 0, 0, 0);

      const dateFrom = sixtyDaysAgo.toISOString();

      const ordersResponse = await fetch(`https://api.mercadolibre.com/orders/search?seller=${ml_user_id}&order.date_created.from=${dateFrom}&limit=1`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      if (ordersResponse.ok) {
        const ordersData = await ordersResponse.json();
        totalSales60d = ordersData.paging.total;
      } else {
        console.warn("Falha ao buscar orders/search:", await ordersResponse.text());
      }
    } catch (error) {
      console.error("Erro ao buscar total de vendas real:", error);
    }

    console.log("=== DADOS DO ML ===");
    console.log("Nickname:", mlData.nickname);
    console.log("Total Sales Period (orders/search):", totalSales60d);
    console.log("Transactions Total:", mlData.seller_reputation?.transactions?.total);
    console.log("Transactions Canceled:", mlData.seller_reputation?.transactions?.canceled);
    console.log("Metrics Sales Completed:", mlData.seller_reputation?.metrics?.sales?.completed);
    console.log("Metrics Cancellations Value:", mlData.seller_reputation?.metrics?.cancellations?.value);
    console.log("==================");

    return NextResponse.json({
      nickname: mlData.nickname,
      permalink: mlData.permalink,
      seller_reputation: mlData.seller_reputation,
      registration_date: mlData.registration_date,
      status: mlData.status,
      thumbnail: mlData.thumbnail,
      site_id: mlData.site_id,
      points: mlData.points,
      total_sales_period: totalSales60d
    });

  } catch (error) {
    console.error("Erro interno:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
