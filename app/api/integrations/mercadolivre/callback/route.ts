import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const ML_APP_ID = process.env.MERCADO_LIVRE_APP_ID;
const ML_SECRET_KEY = process.env.MERCADO_LIVRE_SECRET_KEY;

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  let userId: string | null = null;
  let isExternalLink = false;

  // Estratégia de Autenticação: STATE (Link Externo) vs COOKIE (Link Interno)
  try {
    if (state) {
      // Se tem state, tentamos decodificar para pegar o userId de quem gerou o link
      const decodedState = jwt.verify(state, JWT_SECRET) as { userId: string, type: string };
      if (decodedState && decodedState.userId) {
        userId = decodedState.userId;
        isExternalLink = true;
      }
    } 
    
    // Se não conseguiu pelo state, tenta pelo cookie (usuário logado)
    if (!userId && token) {
      const decodedToken = jwt.verify(token, JWT_SECRET) as { userId: string };
      userId = decodedToken.userId;
    }
  } catch (err) {
    console.error("Erro ao validar state ou token:", err);
  }

  // Se não temos userId de nenhuma forma, aborta
  if (!userId) {
    return NextResponse.redirect(`${baseUrl}/login?error=unauthorized_callback`);
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/dashboard/integrations?error=missing_code`
    );
  }

  try {
    const redirectUri = `${baseUrl}/api/integrations/mercadolivre/callback`;

    // Troca o código pelo token
    const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: ML_APP_ID!,
        client_secret: ML_SECRET_KEY!,
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Erro ML Auth:", tokenData);
      return NextResponse.redirect(
        `${baseUrl}/dashboard/integrations?error=ml_auth_failed`
      );
    }

    const { access_token, refresh_token, expires_in, user_id, token_type, scope } = tokenData;
    
    // Busca informações do usuário para pegar o nickname
    let nickname = null;
    try {
      const userResponse = await fetch("https://api.mercadolibre.com/users/me", {
        headers: {
          "Authorization": `Bearer ${access_token}`
        }
      });
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        nickname = userData.nickname;
      }
    } catch (err) {
      console.error("Erro ao buscar dados do usuário ML:", err);
    }

    // Calcula data de expiração
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

    // Salva no banco de dados (upsert)
    const sql = `
      INSERT INTO mercado_livre_credentials 
      (user_id, ml_user_id, nickname, access_token, refresh_token, token_type, scope, expires_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (user_id, ml_user_id) 
      DO UPDATE SET 
        nickname = EXCLUDED.nickname,
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        token_type = EXCLUDED.token_type,
        scope = EXCLUDED.scope,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    `;

    await query(sql, [
      userId,
      user_id,
      nickname,
      access_token,
      refresh_token,
      token_type,
      scope,
      expiresAt.toISOString()
    ]);

    if (isExternalLink) {
      const successUrl = new URL(`${baseUrl}/integration-success`);
      if (nickname) successUrl.searchParams.set("nickname", nickname);
      successUrl.searchParams.set("id", String(user_id));
      
      return NextResponse.redirect(successUrl);
    } else {
      return NextResponse.redirect(`${baseUrl}/dashboard/integrations?success=true`);
    }

  } catch (error) {
    console.error("Erro callback ML:", error);
    return NextResponse.redirect(
      `${baseUrl}/dashboard/integrations?error=internal_error`
    );
  }
}
