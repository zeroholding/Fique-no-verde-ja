import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type DecodedToken = { userId: string };

type AuthenticatedUser = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_admin: boolean;
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

const authenticateUser = async (request: NextRequest): Promise<AuthenticatedUser> => {
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
    console.error("Falha na autenticacao:", error);
    throw new Error("Falha na autenticacao");
  }
};

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateUser(request);

    if (!user.is_admin) {
      return NextResponse.json({ error: "Apenas administradores podem gerar links de extrato" }, { status: 403 });
    }

    const body = await request.json();
    const { clientId } = body ?? {};

    if (!clientId || typeof clientId !== "string") {
      return NextResponse.json({ error: "clientId obrigatorio" }, { status: 400 });
    }

    const clientResult = await query(
      `
        SELECT name, client_type
        FROM clients
        WHERE id = $1
      `,
      [clientId]
    );

    const client = clientResult.rows[0];

    if (!client) {
      return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });
    }

    if (client.client_type !== "package") {
      return NextResponse.json(
        { error: "Apenas transportadoras (clientes de pacotes) podem gerar link dedicado" },
        { status: 400 }
      );
    }

    const expiresIn = "30d";
    const token = jwt.sign({ clientId, scope: "package-statement" }, JWT_SECRET, { expiresIn });

    const shareUrl = new URL("/packages/extrato", request.nextUrl.origin);
    shareUrl.searchParams.set("token", token);

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    return NextResponse.json(
      {
        url: shareUrl.toString(),
        expiresAt,
        clientName: client.name,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao gerar link publico do extrato:", error);
    const message = error instanceof Error ? error.message : "Erro ao gerar link do extrato";
    const status = message.toLowerCase().includes("autenticacao") ? 401 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
