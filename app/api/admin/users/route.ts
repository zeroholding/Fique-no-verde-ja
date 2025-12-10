import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type DecodedToken = { userId: string };

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
  if (!token) throw new Error("Token de autenticacao nao informado");

  const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("id, first_name, last_name, email, is_admin")
    .eq("id", decoded.userId)
    .single();

  if (error || !user) throw new Error("Usuario nao encontrado");
  if (!user.is_admin) throw new Error("Acesso restrito a administradores");
  return user;
};

export async function GET(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, first_name, last_name, email, phone, is_active, is_admin, created_by_admin, created_at, admin_generated_password")
      .order("first_name", { ascending: true });

    if (error) {
      throw new Error(error.message || "Erro ao listar usuarios");
    }

    return NextResponse.json({ users: data ?? [] }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar usuarios";
    const status = message.includes("administradores") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    const body = await request.json();
    const { firstName, lastName, email, phone } = body;

    if (!firstName || !lastName || !email) {
      return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
    }

    // Verificar se o email já existe
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 });
    }

    // Gerar senha aleatória (8 caracteres alfanuméricos)
    const generatedPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(generatedPassword, 10);

    // Criar usuário
    const { data: newUser, error } = await supabaseAdmin
      .from("users")
      .insert({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        password_hash: passwordHash,
        created_by_admin: true,
        admin_generated_password: generatedPassword,
        is_active: true,
      })
      .select("id, first_name, last_name, email")
      .single();

    if (error) {
      throw new Error(error.message || "Erro ao criar usuário");
    }

    return NextResponse.json(
      { 
        message: "Usuário criado com sucesso", 
        user: newUser,
        generatedPassword 
      }, 
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao criar usuário:", error);
    const message = error instanceof Error ? error.message : "Erro ao criar usuário";
    const status = message.includes("administradores") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const adminUser = await authenticateAdmin(request);
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "ID do usuário obrigatório" }, { status: 400 });
    }

    if (adminUser.id === userId) {
      return NextResponse.json({ error: "Não é possível remover sua própria conta" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("id", userId);

    if (error) {
      throw new Error(error.message || "Erro ao remover usuário");
    }

    return NextResponse.json({ message: "Usuário removido com sucesso" }, { status: 200 });
  } catch (error) {
    console.error("Erro ao remover usuário:", error);
    const message = error instanceof Error ? error.message : "Erro ao remover usuário";
    const status = message.includes("administradores") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
