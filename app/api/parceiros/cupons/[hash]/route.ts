import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// ROTA PÚBLICA! Não precisa de JWT
// GET /api/parceiros/cupons/[hash]
// export async function GET(request: NextRequest, { params }: { params: { hash: string } }) {
export async function GET(request: NextRequest, context: { params: Promise<{ hash: string }> }) {
  try {
    const { hash } = await context.params;

    if (!hash) {
      return NextResponse.json({ error: "Hash inválido" }, { status: 400 });
    }

    // Buscar informações do Cupom (apenas as estatísticas)
    const result = await query(`
        SELECT 
            c.id, c.code, c.discount_type, c.discount_value, c.is_active,
            COUNT(s.id) as current_uses,
            COALESCE(SUM(s.discount_amount), 0) as total_saved
        FROM cupons c
        LEFT JOIN sales s ON s.cupom_id = c.id AND s.status != 'cancelada'
        WHERE c.id = $1
        GROUP BY c.id
    `, [hash]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Cupom não encontrado" }, { status: 404 });
    }

    const cupom = result.rows[0];

    // Buscar histórico recente de usos desse cupom (últimos 50 usos)
    const historyResult = await query(`
        SELECT 
            created_at as sale_date,
            discount_amount
        FROM sales
        WHERE cupom_id = $1 AND discount_amount > 0 AND status != 'cancelada'
        ORDER BY created_at DESC
        LIMIT 50
    `, [hash]);

    return NextResponse.json({
      success: true,
      data: {
        id: cupom.id,
        code: cupom.code,
        discount_type: cupom.discount_type,
        discount_value: Number(cupom.discount_value),
        current_uses: parseInt(cupom.current_uses, 10),
        total_saved: Number(cupom.total_saved),
        is_active: cupom.is_active,
        history: historyResult.rows.map((row: any) => ({
          id: Math.random().toString(), // Helper check
          saleDate: row.sale_date,
          discountAmount: Number(row.discount_amount)
        }))
      }
    });

  } catch (error: any) {
    console.error("Erro rota parceiro cupom:", error);
    // Se não for um UUID válido, o Postgres dá erro de syntax na query
    if (error.code === '22P02') {
      return NextResponse.json({ error: "Cupom inválido" }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
