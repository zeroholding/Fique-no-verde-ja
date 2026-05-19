import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

async function authenticateAdmin(request: NextRequest) {
  const cookieToken = request.cookies.get("token")?.value;
  const authHeader = request.headers.get("authorization");
  let token = cookieToken;
  if (!token && authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }
  if (!token) throw new Error("Unauthorized");
  const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
  const userRes = await query("SELECT is_admin FROM users WHERE id = $1", [decoded.userId]);
  if (!userRes.rows[0]?.is_admin) throw new Error("Acesso negado");
  return decoded.userId;
}

// Auto-migration silenciosa
async function ensureTable() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS evidence_logs (id SERIAL PRIMARY KEY, evidence_id UUID NOT NULL, user_id VARCHAR(255) NOT NULL, action VARCHAR(50) NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`);
    await query(`ALTER TABLE evidence_logs ADD COLUMN IF NOT EXISTS file_name VARCHAR(255)`);
    await query(`ALTER TABLE evidence_logs ADD COLUMN IF NOT EXISTS file_type VARCHAR(100)`);
    await query(`ALTER TABLE evidence_logs ADD COLUMN IF NOT EXISTS evidence_date DATE`);
  } catch(e) {}
}

// GET /api/evidences/logs  — lista logs globais
// GET /api/evidences/logs?users=1 — retorna lista de usuários distintos que apareceram nos logs
export async function GET(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    await ensureTable();

    const { searchParams } = new URL(request.url);

    // Modo especial: buscar lista de usuários distintos para o filtro
    if (searchParams.get("users") === "1") {
      const usersRes = await query(`
        SELECT DISTINCT
          l.user_id,
          COALESCE(u.first_name || ' ' || u.last_name, 'Desconhecido') as user_name
        FROM evidence_logs l
        LEFT JOIN users u ON l.user_id = u.id::text
        ORDER BY user_name ASC
      `);
      return NextResponse.json({ users: usersRes.rows });
    }

    const limit = parseInt(searchParams.get("limit") || "1000", 10);
    const actionFilter = searchParams.get("action");
    const userIdFilter = searchParams.get("userId"); // filtra por user_id exato

    let whereClause = "WHERE 1=1";
    const params: any[] = [];

    if (actionFilter) {
      params.push(actionFilter);
      whereClause += ` AND l.action = $${params.length}`;
    }

    if (userIdFilter) {
      params.push(userIdFilter);
      whereClause += ` AND l.user_id = $${params.length}`;
    }

    const result = await query(`
      SELECT
        l.id,
        l.action,
        l.created_at,
        l.user_id,
        COALESCE(u.first_name || ' ' || u.last_name, 'Desconhecido') as user_name,
        l.evidence_id,
        COALESCE(NULLIF(l.file_name, ''), e.file_name)     as file_name,
        COALESCE(NULLIF(l.file_type, ''), e.file_type)     as file_type,
        COALESCE(l.evidence_date, e.date)                   as evidence_date
      FROM evidence_logs l
      LEFT JOIN users u ON l.user_id = u.id::text
      LEFT JOIN evidences e ON l.evidence_id = e.id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT ${limit}
    `, params);

    return NextResponse.json({ logs: result.rows });
  } catch (error: any) {
    console.error("Error fetching global evidence logs:", error);
    const status = error.message === "Unauthorized" ? 401 : error.message === "Acesso negado" ? 403 : 500;
    return NextResponse.json({ error: error.message || "Erro interno ao buscar logs gerais" }, { status });
  }
}
