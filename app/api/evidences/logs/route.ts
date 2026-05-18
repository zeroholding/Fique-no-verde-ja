import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

export async function GET(request: NextRequest) {
  try {
    const cookieToken = request.cookies.get("token")?.value;
    const authHeader = request.headers.get("authorization");
    let token = cookieToken;
    if (!token && authHeader && authHeader.startsWith("Bearer ")) {
       token = authHeader.split(" ")[1];
    }
    
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    
    // Verifica se é admin
    const userRes = await query("SELECT is_admin FROM users WHERE id = $1", [decoded.userId]);
    if (!userRes.rows[0]?.is_admin) {
       return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    // Pega query params de filtro e paginação (opcional pro futuro)
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "1000", 10);
    const actionFilter = searchParams.get("action");
    const userFilter = searchParams.get("user");
    
    let whereClause = "WHERE 1=1";
    const params: any[] = [];
    
    if (actionFilter) {
       params.push(actionFilter);
       whereClause += ` AND l.action = $${params.length}`;
    }
    
    if (userFilter) {
       params.push(`%${userFilter}%`);
       whereClause += ` AND COALESCE(u.first_name || ' ' || u.last_name, 'Desconhecido') ILIKE $${params.length}`;
    }

    // Busca o log global
    const result = await query(`
       SELECT 
         l.id, 
         l.action, 
         l.created_at,
         l.user_id,
         COALESCE(u.first_name || ' ' || u.last_name, 'Desconhecido') as user_name,
         l.evidence_id,
         l.file_name,
         l.file_type,
         l.evidence_date
       FROM evidence_logs l
       LEFT JOIN users u ON l.user_id = u.id::text
       ${whereClause}
       ORDER BY l.created_at DESC
       LIMIT ${limit}
    `, params);

    return NextResponse.json({ logs: result.rows });
  } catch (error: any) {
    console.error("Error fetching global evidence logs:", error);
    return NextResponse.json({ error: "Erro interno ao buscar logs gerais" }, { status: 500 });
  }
}
