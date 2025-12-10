import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { supabase } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type DecodedToken = {
  userId: string;
};

const getTokenFromRequest = (request: NextRequest) => {
  const cookieToken = request.cookies.get("token")?.value;
  if (cookieToken) {
    return cookieToken;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  return null;
};

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json(
        { error: "Token de autenticacao nao informado" },
        { status: 401 },
      );
    }

    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;

    const { data: user, error } = await supabase
      .from("users")
      .select("id, first_name, last_name, email, phone, is_admin")
      .eq("id", decoded.userId)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar usuário:", error);
      return NextResponse.json(
        { error: "Erro ao buscar usuário" },
        { status: 500 },
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "Usuario nao encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        user: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone: user.phone,
          is_admin: user.is_admin,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Erro ao obter usuario atual:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao obter usuario";

    const isAuthError =
      message.toLowerCase().includes("jwt") ||
      message.toLowerCase().includes("autenticacao");

    return NextResponse.json(
      { error: isAuthError ? "Falha na autenticacao" : message },
      { status: isAuthError ? 401 : 500 },
    );
  }
}
