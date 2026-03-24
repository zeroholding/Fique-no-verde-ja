import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

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

const authenticateUser = async (request: NextRequest) => {
  const token = getTokenFromRequest(request);

  if (!token) {
    throw new Error("Token de autenticacao nao informado");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    const result = await query(
      `SELECT id, first_name, last_name, email, is_admin FROM users WHERE id = $1`,
      [decoded.userId]
    );
    const user = result.rows[0];

    if (!user) {
      throw new Error("Usuario nao encontrado");
    }

    return user;
  } catch (error) {
    throw new Error("Falha na autenticacao");
  }
};

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateUser(request);
    
    if (!user.is_admin) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json({ error: "clientId obrigatorio" }, { status: 400 });
    }

    const res = await query("SELECT statement_slug FROM clients WHERE id = $1", [clientId]);
    const slug = res.rows[0]?.statement_slug || null;

    return NextResponse.json({ slug }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateUser(request);
    
    if (!user.is_admin) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const body = await request.json();
    const { clientId, slug } = body;

    if (!clientId) {
      return NextResponse.json({ error: "clientId obrigatorio" }, { status: 400 });
    }

    let normalizedSlug = null;
    if (slug && typeof slug === "string" && slug.trim() !== "") {
      normalizedSlug = slug.trim().toLowerCase();
      // Only alphanumeric and hyphens
      if (!/^[a-z0-9\-]+$/.test(normalizedSlug)) {
        return NextResponse.json({ error: "Slug invalido. Use apenas letras, numeros e hifens." }, { status: 400 });
      }

      // Check for constraints (slug must be unique)
      const resUnique = await query("SELECT id FROM clients WHERE statement_slug = $1 AND id != $2", [normalizedSlug, clientId]);
      if (resUnique.rows.length > 0) {
        return NextResponse.json({ error: "Esta URL ja esta sendo usada por outro cliente." }, { status: 409 });
      }
    }

    await query("UPDATE clients SET statement_slug = $1 WHERE id = $2", [normalizedSlug, clientId]);

    return NextResponse.json({ success: true, slug: normalizedSlug }, { status: 200 });
  } catch (error) {
    console.error("Erro ao salvar slug:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
