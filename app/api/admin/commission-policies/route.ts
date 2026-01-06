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
      .select("*")
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

export async function POST(request: NextRequest) {
  try {
    const admin = await authenticateAdmin(request);
    const body = await request.json();

    const {
      name,
      value,
      type = "percentage",
      scope = "general",
      applies_to = "all",
      valid_from = new Date().toISOString(),
      valid_until = null,
      description,
      sale_type = "all",
      consider_business_days = false
    } = body;

    // Basic Validation
    if (!name) throw new Error("Nome e obrigatorio");
    if (value === undefined || value === null) throw new Error("Valor e obrigatorio");

    const { data, error } = await supabaseAdmin
      .from("commission_policies")
      .insert({
        name,
        value,
        type,
        scope,
        applies_to,
        valid_from,
        valid_until,
        description,
        sale_type,
        consider_business_days,
        is_active: true,
        created_by_user_id: admin.id
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, policy: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar politica";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) throw new Error("ID da politica e obrigatorio");

    // Remove protected fields
    delete (updates as any).created_at;
    delete (updates as any).created_by_user_id;

    const { data, error } = await supabaseAdmin
      .from("commission_policies")
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, policy: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar politica";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) throw new Error("ID nao informado");

    const { error } = await supabaseAdmin
      .from("commission_policies")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir politica";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
