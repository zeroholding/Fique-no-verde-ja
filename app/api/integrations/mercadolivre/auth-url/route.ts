import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const ML_APP_ID = process.env.MERCADO_LIVRE_APP_ID;

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");

  if (!token) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  if (!ML_APP_ID) {
    console.error("MERCADO_LIVRE_APP_ID is missing in environment variables");
    return NextResponse.json(
      { error: "Configuração do Mercado Livre ausente" },
      { status: 500 }
    );
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const userId = decoded.userId;

    let baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    const redirectUri = `${baseUrl}/api/integrations/mercadolivre/callback`;

    // PKCE: gera code_verifier e code_challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Embute o code_verifier no state JWT para o callback poder usar
    const statePayload = {
      userId: userId,
      type: mode === "external" ? "external_link" : "internal",
      codeVerifier: codeVerifier,
      timestamp: Date.now()
    };
    const stateToken = jwt.sign(statePayload, JWT_SECRET, { expiresIn: "1h" });

    const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${ML_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${stateToken}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

    return NextResponse.json({ url: authUrl });
  } catch (error) {
    console.error("Erro ao gerar URL ML:", error);
    return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  }
}
