import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

// ROTA PRIVADA! Apenas Admin
// GET /api/admin/cupons/[id]
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const userResult = await query("SELECT is_admin FROM users WHERE id = $1", [decoded.userId]);
    
    if (userResult.rowCount === 0 || !userResult.rows[0].is_admin) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    // Buscar informações do Cupom (Estatísticas)
    const result = await query(`
        SELECT 
            c.id, c.code, c.discount_type, c.discount_value, c.is_active, c.max_uses,
            COUNT(s.id) as current_uses,
            COALESCE(SUM(s.discount_amount), 0) as total_saved
        FROM cupons c
        LEFT JOIN sales s ON s.cupom_id = c.id AND s.status != 'cancelada'
        WHERE c.id = $1
        GROUP BY c.id
    `, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Cupom não encontrado" }, { status: 404 });
    }

    const cupom = result.rows[0];

    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const serviceFilter = url.searchParams.get("service");

    let historyWhere = "s.cupom_id = $1 AND s.discount_amount > 0 AND s.status != 'cancelada'";
    const queryParams: any[] = [id];
    
    if (startDate) {
        queryParams.push(`${startDate} 00:00:00`);
        historyWhere += ` AND s.sale_date >= $${queryParams.length}`;
    }
    if (endDate) {
        queryParams.push(`${endDate} 23:59:59`);
        historyWhere += ` AND s.sale_date <= $${queryParams.length}`;
    }
    if (serviceFilter) {
        queryParams.push(serviceFilter);
        historyWhere += ` AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.product_id = $${queryParams.length})`;
    }

    // Buscar histórico de usos com sub-consultas para itens e clientes
    // DIFERENÇA ADMIN: resgatamos também a comissão gerada 'commission_amount'
    const historyResult = await query(`
        SELECT 
            s.id,
            s.created_at as sale_date,
            s.discount_amount,
            s.subtotal,
            s.commission_amount,
            c.name as client_name,
            (SELECT string_agg(si.product_name, ', ') FROM sale_items si WHERE si.sale_id = s.id) as services_names,
            (SELECT COALESCE(sum(si.quantity), 0) FROM sale_items si WHERE si.sale_id = s.id) as total_quantity
        FROM sales s
        LEFT JOIN clients c ON s.client_id = c.id
        WHERE ${historyWhere}
        ORDER BY s.created_at DESC
        LIMIT 100
    `, queryParams);

    return NextResponse.json({
      success: true,
      data: {
        id: cupom.id,
        code: cupom.code,
        discountType: cupom.discount_type,
        discountValue: Number(cupom.discount_value),
        currentUses: parseInt(cupom.current_uses, 10),
        maxUses: cupom.max_uses,
        totalSaved: Number(cupom.total_saved),
        isActive: cupom.is_active,
        history: historyResult.rows.map((row: any) => ({
            id: row.id,
            saleDate: row.sale_date,
            discountAmount: Number(row.discount_amount),
            clientName: row.client_name || "Cliente Não Informado", // SEM OFUSCAÇÃO LGPD NO ADMIN
            services: row.services_names || "-",
            quantity: Number(row.total_quantity),
            grossValue: Number(row.subtotal),
            commissionValue: Number(row.commission_amount) || 0 // RETORNANDO A COMISSÃO INTERNA
        }))
      }
    });

  } catch (error: any) {
    console.error("Erro rota admin cupom:", error);
    if (error.code === '22P02') {
      return NextResponse.json({ error: "Cupom inválido" }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
