import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { supabaseAdmin } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type DecodedToken = {
  userId: string;
};

const getTokenFromRequest = (request: NextRequest) => {
  const cookieToken = request.cookies.get("token")?.value;
  if (cookieToken) return cookieToken;
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return null;
};

const authenticateAdmin = async (request: NextRequest) => {
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Error("Token de autenticacao nao informado");
  }

  const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("id, is_admin")
    .eq("id", decoded.userId)
    .single();

  if (error || !user) {
    throw new Error("Usuario nao encontrado");
  }

  if (!user.is_admin) {
    throw new Error("Acesso restrito a administradores");
  }

  return user;
};

export async function GET(request: NextRequest) {
  try {
    await authenticateAdmin(request);

    const { data, error } = await supabaseAdmin
      .from("commission_policies")
      .select(
        `
          id,
          name,
          description,
          type,
          value,
          scope,
          product_id,
          user_id,
          sale_type,
          applies_to,
          consider_business_days,
          valid_from,
          valid_until,
          is_active,
          created_at,
          updated_at
        `
      )
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message || "Erro ao carregar politicas de comissao");
    }

    return NextResponse.json({ policies: data ?? [] }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao listar politicas de comissao";
    const status = message.includes("administradores") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
