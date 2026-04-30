import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: evidenceId } = await context.params;
    
    let userId = "public";
    
    // Tenta pegar o token do usuário se estiver logado
    const cookieToken = request.cookies.get("token")?.value;
    const authHeader = request.headers.get("authorization");
    let token = cookieToken;
    if (!token && authHeader && authHeader.startsWith("Bearer ")) {
       token = authHeader.split(" ")[1];
    }
    
    if (token) {
       try {
         const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
         userId = decoded.userId;
       } catch (e) {
         // ignore, treats as public
       }
    }

    const body = await request.json();
    const action = body.action; // 'view' or 'download'

    if (!action || !['view', 'download'].includes(action)) {
       return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Garante que a tabela exista
    await query(`
      CREATE TABLE IF NOT EXISTS evidence_logs (
        id SERIAL PRIMARY KEY,
        evidence_id UUID NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        action VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insere o log
    await query(
       `INSERT INTO evidence_logs (evidence_id, user_id, action) VALUES ($1, $2, $3)`,
       [evidenceId, userId, action]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error logging evidence access:", error);
    return NextResponse.json({ error: "Erro interno ao registrar acesso" }, { status: 500 });
  }
}

// GET: Para o painel admin ver quem acessou
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: evidenceId } = await context.params;
    
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

    // Busca os logs dessa evidencia
    const result = await query(`
       SELECT 
         l.id, 
         l.action, 
         l.created_at,
         l.user_id,
         COALESCE(u.first_name || ' ' || u.last_name, 'Desconhecido') as user_name
       FROM evidence_logs l
       LEFT JOIN users u ON l.user_id = u.id::text
       WHERE l.evidence_id::text = $1
       ORDER BY l.created_at DESC
    `, [evidenceId]);

    return NextResponse.json({ logs: result.rows });
  } catch (error: any) {
    console.error("Error fetching evidence logs:", error);
    return NextResponse.json({ error: "Erro interno ao buscar logs" }, { status: 500 });
  }
}
