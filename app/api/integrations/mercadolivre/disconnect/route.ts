import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { ml_user_id } = body;

    if (!ml_user_id) {
      return NextResponse.json({ error: "ID da conta ML não fornecido" }, { status: 400 });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const userId = decoded.userId;

    await query(
      "DELETE FROM mercado_livre_credentials WHERE user_id = $1 AND ml_user_id = $2",
      [userId, ml_user_id]
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Erro ao desconectar ML:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
