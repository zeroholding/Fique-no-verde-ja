import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firstName, lastName, email, phone, password, inviteCode } = body;

    const allowedCodesRaw =
      process.env.ALLOWED_SIGNUP_CODES || process.env.NEXT_ALLOWED_SIGNUP_CODES || "";
    const allowedCodes = allowedCodesRaw
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean);
    const codesRequired = allowedCodes.length > 0;

    if (codesRequired && (!inviteCode || !allowedCodes.includes(inviteCode))) {
      return NextResponse.json(
        { error: "Convite invalido ou expirado" },
        { status: 403 }
      );
    }

    // Validação dos campos obrigatórios
    if (!firstName || !lastName || !email || !phone || !password) {
      return NextResponse.json(
        { error: "Todos os campos são obrigatórios" },
        { status: 400 }
      );
    }

    // Validação da senha
    if (password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter no mínimo 6 caracteres" },
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

    // Validação do telefone (deve estar formatado)
    const phoneRegex = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
    if (!phoneRegex.test(phone)) {
      return NextResponse.json(
        { error: "Telefone inválido. Use o formato (XX) XXXXX-XXXX" },
        { status: 400 }
      );
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10);

    // Verifica se o email já existe
    const { data: existingUser, error: checkError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (checkError) {
      console.error("Erro ao verificar email:", checkError);
      return NextResponse.json(
        { error: "Erro ao verificar email" },
        { status: 500 }
      );
    }

    if (existingUser) {
      return NextResponse.json(
        { error: "Este email já está cadastrado" },
        { status: 409 }
      );
    }

    // Insere o novo usuário
    const { data: user, error: insertError } = await supabase
      .from("users")
      .insert({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        password_hash: passwordHash,
      })
      .select("id, first_name, last_name, email, phone, created_at, is_admin")
      .single();

    if (insertError) {
      console.error("Erro ao inserir usuário:", insertError);
      return NextResponse.json(
        { error: "Erro ao criar usuário" },
        { status: 500 }
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
    });

    if (sessionError) {
      console.error("Erro ao criar sessão:", sessionError);
      // Não retorna erro, pois o usuário foi criado
    }

    // Atualiza o last_login
    const { error: updateError } = await supabase
      .from("users")
      .update({ last_login: new Date().toISOString() })
      .eq("id", user.id);

    if (updateError) {
      console.error("Erro ao atualizar last_login:", updateError);
      // Não retorna erro, pois o usuário foi criado
    }

    const response = NextResponse.json(
      {
        success: true,
        message: "Cadastro realizado com sucesso!",
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
      { status: 201 }
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
    console.error("Erro no cadastro:", error);
    return NextResponse.json(
      { error: "Erro ao realizar cadastro. Tente novamente." },
      { status: 500 }
    );
  }
}
