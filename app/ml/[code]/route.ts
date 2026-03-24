import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const ML_APP_ID = process.env.MERCADO_LIVRE_APP_ID;

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;

  if (!code || code.length > 10) {
    return NextResponse.json({ error: "Codigo invalido" }, { status: 400 });
  }

  if (!ML_APP_ID) {
    console.error("MERCADO_LIVRE_APP_ID ausente nas variaveis de ambiente");
    return NextResponse.json(
      { error: "Configuração do Mercado Livre ausente no servidor" },
      { status: 500 }
    );
  }

  try {
    // 1. Encontra o usuário dono deste código
    const res = await query("SELECT id FROM users WHERE ml_invite_code = $1", [code]);
    const user = res.rows[0];

    if (!user) {
      return NextResponse.json({ error: "Link de convite invalido ou nao encontrado." }, { status: 404 });
    }

    const userId = user.id;

    // 2. Gera os parametros de segurança e de state na hora do clique!
    let baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    const redirectUri = `${baseUrl}/api/integrations/mercadolivre/callback`;

    // PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Embute o code_verifier no state JWT (validade de 1 hora)
    const statePayload = {
      userId: userId,
      type: "external_link",
      codeVerifier: codeVerifier,
      timestamp: Date.now()
    };
    const stateToken = jwt.sign(statePayload, JWT_SECRET, { expiresIn: "1h" });

    // 3. Monta a URL de Autorizacao do Mercado Livre
    const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${ML_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${stateToken}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

    // 4. Redireciona o usuario ANTES dele piscar o olho
    return NextResponse.redirect(authUrl);

  } catch (error) {
    console.error("Erro no redirect pro Mercado Livre:", error);
    return NextResponse.json({ error: "Erro interno ao preparar autenticação" }, { status: 500 });
  }
}
