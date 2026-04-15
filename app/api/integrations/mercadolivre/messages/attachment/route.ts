import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return new NextResponse("Não autorizado", { status: 401 });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const { searchParams } = new URL(request.url);
    const mlUserId = searchParams.get("ml_user_id");
    const attachmentId = searchParams.get("id");

    if (!mlUserId || !attachmentId) {
      return new NextResponse("ml_user_id e id do anexo são obrigatórios", { status: 400 });
    }

    const result = await query(
      "SELECT access_token FROM mercado_livre_credentials WHERE user_id = $1 AND ml_user_id = $2 LIMIT 1",
      [decoded.userId, mlUserId]
    );

    if (result.rows.length === 0) {
      return new NextResponse("Conta não conectada", { status: 404 });
    }

    const { access_token } = result.rows[0];

    const response = await fetch(`https://api.mercadolibre.com/messages/attachments/${attachmentId}`, {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Status ${response.status} na imagem do ML:`, text);
      return new NextResponse("Falha ao baixar imagem do Mercado Livre", { status: response.status });
    }

    // Stream the image directly back to the client
    const headers = new Headers();
    headers.set("Content-Type", response.headers.get("content-type") || "image/jpeg");
    headers.set("Cache-Control", "public, max-age=86400"); // Cache for 1 day

    return new NextResponse(response.body, {
      status: 200,
      headers
    });
  } catch (error) {
    console.error("Erro ao buscar imagem do anexo:", error);
    return new NextResponse("Erro interno", { status: 500 });
  }
}
