import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { supabaseAdmin } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const ML_APP_ID = process.env.MERCADO_LIVRE_APP_ID;

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode"); // 'external' ou null

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

    console.log("Generating ML Auth URL with App ID:", ML_APP_ID);
    
    // Determina a URL de callback usando a variável de ambiente para garantir match com o ngrok
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const redirectUri = `${baseUrl}/api/integrations/mercadolivre/callback`;
    
    let stateParam = "";
    
    // Se for modo externo, geramos um state com o ID do usuário
    if (mode === "external") {
      const statePayload = {
        userId: userId,
        type: "external_link",
        timestamp: Date.now()
      };
      // Assina o state para segurança (evita que alterem o ID)
      const stateToken = jwt.sign(statePayload, JWT_SECRET, { expiresIn: "1h" });
      stateParam = `&state=${stateToken}`;
    }

    const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${ML_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}${stateParam}`;

    return NextResponse.json({ url: authUrl });
  } catch (error) {
    console.error("Erro ao gerar URL ML:", error);
    return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  }
}
