import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type DecodedToken = {
  userId: string;
};

export type AuthenticatedUser = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_admin: boolean;
};

export function getRequestToken(request: NextRequest): string | null {
  const cookieToken = request.cookies.get("token")?.value;
  if (cookieToken) {
    return cookieToken;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  return null;
}

export async function authenticateRequest(
  request: NextRequest,
): Promise<AuthenticatedUser> {
  const token = getRequestToken(request);
  if (!token) {
    throw new Error("Token de autenticacao nao informado");
  }

  let decoded: DecodedToken;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
  } catch {
    throw new Error("Token invalido");
  }

  const result = await query<AuthenticatedUser>(
    `SELECT id, first_name, last_name, email, is_admin
     FROM users
     WHERE id = $1`,
    [decoded.userId],
  );

  const user = result.rows[0];
  if (!user) {
    throw new Error("Usuario nao encontrado");
  }

  return user;
}

export async function requireAdmin(
  request: NextRequest,
): Promise<AuthenticatedUser> {
  const user = await authenticateRequest(request);
  if (!user.is_admin) {
    throw new Error("Acesso restrito a administradores");
  }

  return user;
}

export function getAuthErrorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("administradores")) {
    return 403;
  }
  if (
    message.includes("Token") ||
    message.includes("autenticacao") ||
    message.includes("Usuario")
  ) {
    return 401;
  }
  return 500;
}
