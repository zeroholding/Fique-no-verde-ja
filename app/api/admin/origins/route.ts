import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

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
    return authHeader.split(" ")[1];
  }
  return null;
};

const authenticateAdmin = async (request: NextRequest) => {
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Error("Token de autenticacao nao informado");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;

    const result = await query(
      `SELECT id, first_name, last_name, email, is_admin
       FROM users
       WHERE id = $1`,
      [decoded.userId]
    );

    const adminUser = result.rows[0];
    if (!adminUser || !adminUser.is_admin) {
      throw new Error("Usuario nao possui permissao administrativa");
    }

    return adminUser;
  } catch (error) {
    console.error("Falha na autenticacao do administrador:", error);
    throw new Error("Falha na autenticacao do administrador");
  }
};

const authenticateUser = async (request: NextRequest) => {
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Error("Token de autenticacao nao informado");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;

    const result = await query(
      `SELECT id, first_name, last_name, email, is_admin
       FROM users
       WHERE id = $1`,
      [decoded.userId]
    );

    const user = result.rows[0];
    if (!user) {
      throw new Error("Usuario nao encontrado");
    }

    return user;
  } catch (error) {
    console.error("Falha na autenticacao:", error);
    throw new Error("Falha na autenticacao");
  }
};

// GET - Listar todas as origens
export async function GET(request: NextRequest) {
  try {
    await authenticateUser(request);

    const origins = await query(
      `SELECT id, name, description, is_active, created_at, updated_at
       FROM client_origins
       ORDER BY name ASC`
    );

    return NextResponse.json({ origins: origins.rows }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel carregar as origens";
    const status = message.includes("autenticacao") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// POST - Criar nova origem
export async function POST(request: NextRequest) {
  try {
    await authenticateAdmin(request);

    const body = await request.json();
    const { name, description } = body;

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "Nome da origem e obrigatorio" },
        { status: 400 }
      );
    }

    // Verificar se já existe uma origem com este nome
    const existingOrigin = await query(
      "SELECT id FROM client_origins WHERE LOWER(name) = LOWER($1)",
      [name.trim()]
    );

    if (existingOrigin.rows.length > 0) {
      return NextResponse.json(
        { error: "Ja existe uma origem com este nome" },
        { status: 409 }
      );
    }

    const result = await query(
      `INSERT INTO client_origins (name, description)
       VALUES ($1, $2)
       RETURNING id, name, description, is_active, created_at`,
      [name.trim(), description || null]
    );

    const origin = result.rows[0];

    return NextResponse.json(
      {
        origin,
        message: "Origem criada com sucesso",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao criar origem:", error);
    const message = error instanceof Error ? error.message : "Erro ao criar origem";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

// PUT - Atualizar origem existente
export async function PUT(request: NextRequest) {
  try {
    await authenticateAdmin(request);

    const body = await request.json();
    const { id, name, description, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID da origem e obrigatorio" },
        { status: 400 }
      );
    }

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "Nome da origem e obrigatorio" },
        { status: 400 }
      );
    }

    // Verificar se já existe outra origem com este nome
    const existingOrigin = await query(
      "SELECT id FROM client_origins WHERE LOWER(name) = LOWER($1) AND id != $2",
      [name.trim(), id]
    );

    if (existingOrigin.rows.length > 0) {
      return NextResponse.json(
        { error: "Ja existe outra origem com este nome" },
        { status: 409 }
      );
    }

    const result = await query(
      `UPDATE client_origins
       SET name = $1, description = $2, is_active = $3
       WHERE id = $4
       RETURNING id, name, description, is_active, created_at, updated_at`,
      [name.trim(), description || null, isActive !== undefined ? isActive : true, id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Origem nao encontrada" },
        { status: 404 }
      );
    }

    const origin = result.rows[0];

    return NextResponse.json(
      {
        origin,
        message: "Origem atualizada com sucesso",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao atualizar origem:", error);
    const message = error instanceof Error ? error.message : "Erro ao atualizar origem";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE - Remover origem
export async function DELETE(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    const { originId } = await request.json();

    if (!originId) {
      return NextResponse.json(
        { error: "ID da origem obrigatorio" },
        { status: 400 }
      );
    }

    // Verificar se existem clientes usando esta origem
    const clientsWithOrigin = await query(
      "SELECT COUNT(*) as count FROM clients WHERE origin_id = $1",
      [originId]
    );

    const clientCount = parseInt(clientsWithOrigin.rows[0].count);

    if (clientCount > 0) {
      return NextResponse.json(
        {
          error: `Nao e possivel excluir esta origem pois existem ${clientCount} cliente(s) vinculado(s) a ela`,
        },
        { status: 409 }
      );
    }

    const result = await query(
      "DELETE FROM client_origins WHERE id = $1 RETURNING id",
      [originId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Origem nao encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: "Origem removida com sucesso" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao excluir origem:", error);
    const message = error instanceof Error ? error.message : "Erro ao excluir origem";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
