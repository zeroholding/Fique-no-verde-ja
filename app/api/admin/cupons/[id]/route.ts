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
            c.id, c.code, c.discount_type, c.discount_value, c.commission_percentage, c.is_active, c.max_uses,
            COUNT(s.id) as current_uses,
            COALESCE(SUM(s.discount_amount), 0) as total_saved,
            COALESCE(SUM((s.subtotal - s.discount_amount) * (c.commission_percentage / 100.0)), 0) as total_commission
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

    const commissionPercentage = Number(cupom.commission_percentage) || 0;

    return NextResponse.json({
      success: true,
      data: {
        id: cupom.id,
        code: cupom.code,
        discountType: cupom.discount_type,
        discountValue: Number(cupom.discount_value),
        commissionPercentage,
        currentUses: parseInt(cupom.current_uses, 10),
        maxUses: cupom.max_uses,
        totalSaved: Number(cupom.total_saved),
        totalCommission: Number(cupom.total_commission),
        isActive: cupom.is_active,
        history: historyResult.rows.map((row: any) => {
            const grossValue = Number(row.subtotal);
            const discountAmount = Number(row.discount_amount);
            const commissionValue = (grossValue - discountAmount) * (commissionPercentage / 100);

            return {
                id: row.id,
                saleDate: row.sale_date,
                discountAmount,
                clientName: row.client_name || "Cliente Não Informado", // SEM OFUSCAÇÃO LGPD NO ADMIN
                services: row.services_names || "-",
                quantity: Number(row.total_quantity),
                grossValue,
                commissionValue
            };
        })
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

// PUT /api/admin/cupons/[id]
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

    const { code, type, value, max_uses, expires_at, commission_percentage, partner_slug, is_active } = await request.json();

    if (!code || !type || value === undefined) {
      return NextResponse.json({ error: "Dados inválidos: code, type e value são obrigatórios." }, { status: 400 });
    }

    const upperCode = code.toUpperCase().trim();
    if (type !== 'percent' && type !== 'fixed') {
      return NextResponse.json({ error: "Tipo inválido: deve ser 'percent' ou 'fixed'." }, { status: 400 });
    }

    const cleanSlug = partner_slug ? partner_slug.toLowerCase().replace(/[^a-z0-9\-]/g, '').trim() : null;

    // Atualiza os dados principais. `is_active` poder ser fornecido ou mantido se omitido.
    // Usamos COALESCE para is_active pra caso venha nulo não quebrar, mas vamos requerer que a rota mande explícito.
    const result = await query(
      `UPDATE cupons SET 
          code = $1, 
          discount_type = $2, 
          discount_value = $3, 
          max_uses = $4, 
          expires_at = $5, 
          commission_percentage = $6, 
          partner_slug = $7,
          is_active = COALESCE($8, is_active)
       WHERE id = $9 RETURNING *`,
      [upperCode, type, value, max_uses || null, expires_at ? new Date(expires_at) : null, commission_percentage || 0, cleanSlug || null, is_active, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Cupom não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result.rows[0] });

  } catch (error: any) {
    console.error("Erro atualizando cupom admin:", error);
    if (error.code === '23505') {
       return NextResponse.json({ error: "Já existe outro cupom com esse código ou slug personalizado." }, { status: 400 });
    }
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}

// DELETE /api/admin/cupons/[id]
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

    const result = await query("DELETE FROM cupons WHERE id = $1 RETURNING id", [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Cupom não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: id });

  } catch (error: any) {
    console.error("Erro ao deletar cupom:", error);
    
    // Tratamento específico para erro de restrição de chave estrangeira (tentou exluir cupom com uso em vendas)
    if (error.code === '23503') {
       return NextResponse.json({ 
          error: "Não é possível excluir este cupom porque ele já possui histórico de vendas associadas. Recomendamos desativá-lo para preservar os relatórios.",
          isForeignKeyError: true
       }, { status: 400 });
    }

    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}

