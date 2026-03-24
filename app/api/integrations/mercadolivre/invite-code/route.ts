import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

const generateShortCode = () => {
  return crypto.randomBytes(3).toString('hex').substring(0, 6); // 6 char random hex code
};

export async function GET(request: NextRequest) {
  const cookieToken = request.cookies.get("token")?.value;
  let token = cookieToken;

  if (!token) {
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return NextResponse.json({ error: "Sessao expirada" }, { status: 401 });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const userId = decoded.userId;

    let res = await query("SELECT ml_invite_code FROM users WHERE id = $1", [userId]);
    let code = res.rows[0]?.ml_invite_code;

    // Se nao tem codigo, gera um novo unico
    if (!code) {
      let isUnique = false;
      while (!isUnique) {
        code = generateShortCode();
        try {
          // Tenta fazer o update, se der erro de UNIQUE constraint ele cai no catch e tenta outro
          await query("UPDATE users SET ml_invite_code = $1 WHERE id = $2", [code, userId]);
          isUnique = true;
        } catch (dbErr: any) {
          if (dbErr.code !== '23505') { // 23505 is unique_violation
            throw dbErr;
          }
        }
      }
    }

    let baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }

    const shortUrl = `${baseUrl}/ml/${code}`;

    return NextResponse.json({ code, shortUrl });
  } catch (error) {
    console.error("Erro ao buscar ML invite code:", error);
    return NextResponse.json({ error: "Sessão inválida ou erro interno" }, { status: 500 });
  }
}
