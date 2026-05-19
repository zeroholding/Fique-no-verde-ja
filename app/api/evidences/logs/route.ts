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

async function ensureTable() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS evidence_logs (id SERIAL PRIMARY KEY, evidence_id UUID NOT NULL, user_id VARCHAR(255) NOT NULL, action VARCHAR(50) NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`);
    await query(`ALTER TABLE evidence_logs ADD COLUMN IF NOT EXISTS file_name VARCHAR(255)`);
    await query(`ALTER TABLE evidence_logs ADD COLUMN IF NOT EXISTS file_type VARCHAR(100)`);
    await query(`ALTER TABLE evidence_logs ADD COLUMN IF NOT EXISTS evidence_date DATE`);
  } catch(e) {}
}

export async function GET(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    await ensureTable();

    const { searchParams } = new URL(request.url);

    // Modo especial: lista de usuários distintos (logs + quem fez uploads)
    if (searchParams.get("users") === "1") {
      const usersRes = await query(`
        SELECT DISTINCT user_id, user_name FROM (
          SELECT l.user_id, COALESCE(u.first_name || ' ' || u.last_name, 'Desconhecido') as user_name
          FROM evidence_logs l
          LEFT JOIN users u ON l.user_id = u.id::text
          UNION
          SELECT ev.created_by_user_id::text as user_id,
                 COALESCE(u.first_name || ' ' || u.last_name, 'Desconhecido') as user_name
          FROM evidences ev
          LEFT JOIN users u ON ev.created_by_user_id = u.id
        ) combined
        ORDER BY user_name ASC
      `);
      return NextResponse.json({ users: usersRes.rows });
    }

    const limit = parseInt(searchParams.get("limit") || "2000", 10);
    const actionFilter = searchParams.get("action") || ""; // ex: "upload", "view", ""
    const userIdFilter = searchParams.get("userId") || "";

    // ----- PARTE 1: logs reais da tabela evidence_logs -----
    // Só inclui se o filtro de ação for vazio OU diferente de "upload" (uploads reais da tabela)
    // OU se o filtro for "upload" (também aparece lá caso já tenha sido logado)
    const logParams: any[] = [];
    let logWhere = "WHERE 1=1";

    if (actionFilter) {
      logParams.push(actionFilter);
      logWhere += ` AND l.action = $${logParams.length}`;
    }
    if (userIdFilter) {
      logParams.push(userIdFilter);
      logWhere += ` AND l.user_id = $${logParams.length}`;
    }

    // ----- PARTE 2: uploads históricos da tabela evidences -----
    // Apenas exibidos quando o filtro de ação é "" (todos) ou "upload"
    const showUploads = actionFilter === "" || actionFilter === "upload";

    const evParams: any[] = [];
    let evWhere = `WHERE NOT EXISTS (
      SELECT 1 FROM evidence_logs ul
      WHERE ul.evidence_id = ev.id AND ul.action = 'upload'
    )`;

    if (userIdFilter) {
      evParams.push(userIdFilter);
      evWhere += ` AND ev.created_by_user_id::text = $${evParams.length}`;
    }

    // Monta a query
    const logsSql = `
      SELECT
        l.id::text                                             AS id,
        l.action,
        l.created_at,
        l.user_id,
        COALESCE(u.first_name || ' ' || u.last_name, 'Desconhecido') AS user_name,
        l.evidence_id::text                                   AS evidence_id,
        COALESCE(NULLIF(l.file_name, ''), e.file_name)        AS file_name,
        COALESCE(NULLIF(l.file_type, ''), e.file_type)        AS file_type,
        COALESCE(l.evidence_date, e.date)                     AS evidence_date
      FROM evidence_logs l
      LEFT JOIN users     u  ON l.user_id      = u.id::text
      LEFT JOIN evidences e  ON l.evidence_id  = e.id
      ${logWhere}
    `;

    const uploadsSql = showUploads ? `
      UNION ALL
      SELECT
        ('ev-' || ev.id::text)               AS id,
        'upload'                              AS action,
        ev.created_at,
        ev.created_by_user_id::text           AS user_id,
        COALESCE(pu.first_name || ' ' || pu.last_name, 'Desconhecido') AS user_name,
        ev.id::text                           AS evidence_id,
        ev.file_name,
        ev.file_type,
        ev.date                               AS evidence_date
      FROM evidences ev
      LEFT JOIN users pu ON ev.created_by_user_id = pu.id
      ${evWhere}
    ` : "";

    // Para o UNION precisamos indexar os params da segunda query a partir do índice correto
    // Como são queries separadas com params próprios não há conflito de $1/$2
    // Mas pg não suporta múltiplos conjuntos de params — precisamos juntar
    const allParams = [...logParams, ...evParams];

    // Reindexar evParams dentro do uploadsSql (offset = logParams.length)
    const reindexedUploadsSql = uploadsSql.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n) + logParams.length}`);

    const finalSql = `
      SELECT * FROM (
        ${logsSql}
        ${reindexedUploadsSql}
      ) combined
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    const result = await query(finalSql, allParams);

    return NextResponse.json({ logs: result.rows });
  } catch (error: any) {
    console.error("Error fetching global evidence logs:", error);
    const status = error.message === "Unauthorized" ? 401 : error.message === "Acesso negado" ? 403 : 500;
    return NextResponse.json({ error: error.message || "Erro interno ao buscar logs gerais" }, { status });
  }
}
