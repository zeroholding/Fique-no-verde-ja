import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validação dos campos obrigatórios
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email e senha são obrigatórios" },
        { status: 400 }
      );
    }

    // Validação do formato do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Email inválido" },
        { status: 400 }
      );
    }

    // Busca o usuário pelo email
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("id, first_name, last_name, email, phone, password_hash, is_active, is_admin")
      .eq("email", email)
      .maybeSingle();

    if (fetchError) {
      console.error("Erro ao buscar usuário:", fetchError);
      return NextResponse.json(
        { error: "Erro ao buscar usuário" },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "Email ou senha incorretos" },
        { status: 401 }
      );
    }

    // Verifica se o usuário está ativo
    if (!user.is_active) {
      return NextResponse.json(
        { error: "Usuário desativado. Entre em contato com o suporte." },
        { status: 403 }
      );
    }

    // Verifica a senha
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Email ou senha incorretos" },
        { status: 401 }
      );
    }

    // Gera o token JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        isAdmin: user.is_admin,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Registra a sessão
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error: sessionError } = await supabase.from("sessions").insert({
      user_id: user.id,
      token,
      expires_at: expiresAt.toISOString(),
      ip_address: request.headers.get("x-forwarded-for") || "unknown",
      user_agent: request.headers.get("user-agent") || "unknown",
    });

    if (sessionError) {
      console.error("Erro ao criar sessão:", sessionError);
      // Não retorna erro, pois o login foi bem-sucedido
    }

    // Atualiza o last_login
    const { error: updateError } = await supabase
      .from("users")
      .update({ last_login: new Date().toISOString() })
      .eq("id", user.id);

    if (updateError) {
      console.error("Erro ao atualizar last_login:", updateError);
      // Não retorna erro, pois o login foi bem-sucedido
    }

    const response = NextResponse.json(
      {
        success: true,
        message: "Login realizado com sucesso!",
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          phone: user.phone,
          isAdmin: user.is_admin,
        },
        token,
      },
      { status: 200 }
    );

    response.cookies.set("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("Erro no login:", error);
    return NextResponse.json(
      { error: "Erro ao realizar login. Tente novamente." },
      { status: 500 }
    );
  }
}
