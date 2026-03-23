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
  let baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  let userId: string | null = null;
  let isExternalLink = false;
  let codeVerifier: string | null = null;

  // Estratégia de Autenticação: STATE (sempre usado agora) ou COOKIE (fallback)
  try {
    if (state) {
      const decodedState = jwt.verify(state, JWT_SECRET) as { userId: string; type: string; codeVerifier?: string };
      if (decodedState && decodedState.userId) {
        userId = decodedState.userId;
        isExternalLink = decodedState.type === "external_link";
        codeVerifier = decodedState.codeVerifier || null;
      }
    } 
    
    if (!userId && token) {
      const decodedToken = jwt.verify(token, JWT_SECRET) as { userId: string };
      userId = decodedToken.userId;
    }
  } catch (err) {
    console.error("Erro ao validar state ou token:", err);
  }

  if (!userId) {
    return NextResponse.json({ DEBUG_ERROR: "cb_no_user_id", state: state ? "present" : "missing", cookie: token ? "present" : "missing" }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ DEBUG_ERROR: "cb_no_code" }, { status: 400 });
  }

  try {
    const redirectUri = `${baseUrl}/api/integrations/mercadolivre/callback`;

    // Monta os parâmetros do token exchange
    const tokenParams: Record<string, string> = {
      grant_type: "authorization_code",
      client_id: ML_APP_ID!,
      client_secret: ML_SECRET_KEY!,
      code: code,
      redirect_uri: redirectUri,
    };

    // PKCE: envia code_verifier se disponível
    if (codeVerifier) {
      tokenParams.code_verifier = codeVerifier;
    }

    console.log("[ML CALLBACK] Trocando código por token. redirectUri:", redirectUri, "PKCE:", !!codeVerifier);

    // Troca o código pelo token
    const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: new URLSearchParams(tokenParams),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Erro ML Auth:", tokenData);
      return NextResponse.json({ DEBUG_ERROR: "ml_token_exchange_failed", status: tokenResponse.status, ml_response: tokenData, redirect_uri_used: redirectUri, pkce_used: !!codeVerifier }, { status: 400 });
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

    // Verifica se já existe uma entrada para esse user_id + ml_user_id
    const existingResult = await query(
      "SELECT id FROM mercado_livre_credentials WHERE user_id = $1 AND ml_user_id = $2",
      [userId, user_id]
    );

    if (existingResult.rows.length > 0) {
      // Atualiza o registro existente
      await query(
        `UPDATE mercado_livre_credentials 
         SET nickname = $1, access_token = $2, refresh_token = $3, token_type = $4, scope = $5, expires_at = $6, updated_at = NOW()
         WHERE user_id = $7 AND ml_user_id = $8`,
        [nickname, access_token, refresh_token, token_type, scope, expiresAt.toISOString(), userId, user_id]
      );
    } else {
      // Insere novo registro
      await query(
        `INSERT INTO mercado_livre_credentials 
         (user_id, ml_user_id, nickname, access_token, refresh_token, token_type, scope, expires_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [userId, user_id, nickname, access_token, refresh_token, token_type, scope, expiresAt.toISOString()]
      );
    }

    console.log("[ML CALLBACK] Conta salva! ml_user_id:", user_id, "nickname:", nickname);

    if (isExternalLink) {
      const successUrl = new URL(`${baseUrl}/integration-success`);
      if (nickname) successUrl.searchParams.set("nickname", nickname);
      successUrl.searchParams.set("id", String(user_id));
      
      return NextResponse.redirect(successUrl);
    } else {
      const redirectUrl = `${baseUrl}/dashboard/integrations?success=true`;
      const response = NextResponse.redirect(redirectUrl);

      // Re-seta o cookie de sessão no redirect para o middleware não bloquear
      const userResult = await query(
        "SELECT id, email, is_admin FROM users WHERE id = $1",
        [userId]
      );

      if (userResult.rows.length > 0) {
        const userData = userResult.rows[0];
        const sessionToken = jwt.sign(
          {
            userId: userData.id,
            email: userData.email,
            isAdmin: userData.is_admin,
          },
          JWT_SECRET,
          { expiresIn: "7d" }
        );

        response.cookies.set("token", sessionToken, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 7,
        });
      }

      return response;
    }

  } catch (error) {
    console.error("Erro callback ML:", error);
    return NextResponse.json({ DEBUG_ERROR: "cb_crash", message: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
