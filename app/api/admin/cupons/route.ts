import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

// Tipos permitidos
type DiscountType = 'percent' | 'fixed';

// GET /api/admin/cupons
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const userResult = await query("SELECT is_admin FROM users WHERE id = $1", [decoded.userId]);
    
    // Somente admin geral
    if (userResult.rowCount === 0 || !userResult.rows[0].is_admin) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    // Listar todos os cupons junto com suas estatísticas de uso
    const result = await query(`
      SELECT 
        c.*,
        COUNT(s.id) as current_uses,
        COALESCE(SUM(s.discount_amount), 0) as total_saved
      FROM cupons c
      LEFT JOIN sales s ON s.cupom_id = c.id AND s.status != 'cancelada'
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);

    return NextResponse.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error("Erro listando cupons:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}

// POST /api/admin/cupons
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const userResult = await query("SELECT is_admin FROM users WHERE id = $1", [decoded.userId]);
    
    // Somente admin geral
    if (userResult.rowCount === 0 || !userResult.rows[0].is_admin) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const { code, type, value, max_uses, expires_at, commission_percentage = 0, partner_slug } = await request.json();

    if (!code || !type || value === undefined) {
      return NextResponse.json({ error: "Dados inválidos: code, type e value são obrigatórios." }, { status: 400 });
    }

    const upperCode = code.toUpperCase().trim();
    if (type !== 'percent' && type !== 'fixed') {
      return NextResponse.json({ error: "Tipo inválido: deve ser 'percent' ou 'fixed'." }, { status: 400 });
    }

    // Sanitize slug
    const cleanSlug = partner_slug ? partner_slug.toLowerCase().replace(/[^a-z0-9\-]/g, '').trim() : null;

    const result = await query(
      `INSERT INTO cupons 
       (code, discount_type, discount_value, max_uses, expires_at, commission_percentage, partner_slug) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [upperCode, type, value, max_uses || null, expires_at ? new Date(expires_at) : null, commission_percentage, cleanSlug || null]
    );

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error("Erro criando cupom:", error);
    if (error.code === '23505') { // unique violation
      return NextResponse.json({ error: "Já existe um cupom com este código." }, { status: 400 });
    }
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
