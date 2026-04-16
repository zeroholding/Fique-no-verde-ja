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

    // Buscar informações do Cupom (por slug primeiro, depois por ID se parecer UUID)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hash);
    
    const result = await query(`
        SELECT 
            id, code, discount_type, discount_value, commission_percentage, is_active, max_uses
        FROM cupons
        WHERE (partner_slug = $1 ${isUUID ? 'OR id = $2' : ''}) AND deleted_at IS NULL
    `, isUUID ? [hash, hash] : [hash]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Cupom não encontrado" }, { status: 404 });
    }

    const cupom = result.rows[0];
    const cupomId = cupom.id; // Use resolved ID for history queries

    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const serviceFilter = url.searchParams.get("service");

    let historyWhere = "s.cupom_id = $1 AND s.discount_amount > 0 AND s.status != 'cancelada'";
    const queryParams: any[] = [cupomId];
    
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
    const historyResult = await query(`
        SELECT 
            s.id,
            s.created_at as sale_date,
            s.discount_amount,
            s.subtotal,
            c.name as client_name,
            (SELECT string_agg(si.product_name, ', ') FROM sale_items si WHERE si.sale_id = s.id) as services_names,
            (SELECT COALESCE(sum(si.quantity), 0) FROM sale_items si WHERE si.sale_id = s.id) as total_quantity
        FROM sales s
        LEFT JOIN clients c ON s.client_id = c.id
        WHERE ${historyWhere}
        ORDER BY s.created_at DESC
        LIMIT 100
    `, queryParams);

    const commission_percentage = Number(cupom.commission_percentage) || 0;

    // Buscar as estatísticas totais usando as mesmas regras do filtro
    const statsResult = await query(`
        SELECT 
            COUNT(s.id) as current_uses,
            COALESCE(SUM(s.discount_amount), 0) as total_saved,
            COALESCE(SUM((s.subtotal - s.discount_amount) * (${commission_percentage} / 100.0)), 0) as total_commission
        FROM sales s
        WHERE ${historyWhere}
    `, queryParams);

    const stats = statsResult.rows[0] || { current_uses: 0, total_saved: 0, total_commission: 0 };

    return NextResponse.json({
      success: true,
      data: {
        id: cupom.id,
        code: cupom.code,
        discountType: cupom.discount_type,
        discountValue: Number(cupom.discount_value),
        commissionPercentage: commission_percentage,
        currentUses: parseInt(stats.current_uses, 10),
        maxUses: cupom.max_uses,
        totalSaved: Number(stats.total_saved),
        totalCommission: Number(stats.total_commission),
        isActive: cupom.is_active,
        history: historyResult.rows.map((row: any) => {
          let obfuscatedName = "Cliente Não Informado";
          if (row.client_name) {
             const parts = row.client_name.trim().split(" ");
             obfuscatedName = parts.map((p: string) => p.charAt(0) + "***").join(" ");
          }
          
          const grossValue = Number(row.subtotal);
          const discountAmount = Number(row.discount_amount);
          const commissionValue = (grossValue - discountAmount) * (commission_percentage / 100);

          return {
            id: row.id,
            saleDate: row.sale_date,
            discountAmount,
            clientName: obfuscatedName,
            services: row.services_names || "-",
            quantity: Number(row.total_quantity),
            grossValue,
            commissionValue
          };
        })
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
