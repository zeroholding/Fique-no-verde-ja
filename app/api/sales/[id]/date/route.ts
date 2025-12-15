
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";

// PUT /api/sales/[id]/date
// PUT /api/sales/[id]/date
export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const payload = await verifyToken(token);
    if (!payload) {
        return NextResponse.json({ error: "Invalid Token" }, { status: 401 });
    }

    // 1. Verify Admin
    if (!payload.isAdmin) {
      return NextResponse.json(
        { error: "Apenas administradores podem alterar a data da venda" },
        { status: 403 }
      );
    }

    const saleId = params.id;
    const body = await request.json();
    const { saleDate } = body;

    if (!saleDate) {
      return NextResponse.json(
        { error: "Nova data é obrigatória" },
        { status: 400 }
      );
    }

    const newDate = new Date(saleDate);
    if (isNaN(newDate.getTime())) {
      return NextResponse.json(
        { error: "Data inválida" },
        { status: 400 }
      );
    }

    console.log(`[UPDATE SALE DATE] Sale: ${saleId}, New Date: ${saleDate}, User: ${payload.userId}`);

    // Start Transaction
    await query("BEGIN");

    try {
      // 2. Update Sale Date
      await query(
        `UPDATE sales SET sale_date = $1 WHERE id = $2`,
        [newDate, saleId]
      );

      // 3. Delete old commissions for this sale
      await query(
        `DELETE FROM commissions WHERE sale_id = $1`,
        [saleId]
      );

      // 4. Recalculate Commissions
      // Fetch Sale Items
      const salesResult = await query(
        `SELECT 
            s.id as sale_id, 
            s.attendant_id,
            s.created_at, 
            si.id as item_id,
            si.product_id,
            si.quantity,
            si.sale_type,
            si.total,
            si.subtotal
         FROM sales s
         JOIN sale_items si ON s.id = si.sale_id
         WHERE s.id = $1
           AND si.sale_type IN ('01', '03')
           AND s.status != 'cancelada'
        `,
        [saleId]
      );

      console.log(`[UPDATE SALE DATE] Recalculating ${salesResult.rows.length} items.`);

      for (const item of salesResult.rows) {
          const attendantId = item.attendant_id;
          // Determine Base Value
          // Type 03 (Consume) => Subtotal (Gross)
          // Type 01 (Common) => Total (Net)
          const baseValue = parseFloat(item.sale_type === '03' ? item.subtotal : item.total);

          let itemCommission = 0;
          let itemCommissionType = 'percentage';
          let itemCommissionRate = 5.00; // Default fallback

          // Policy Lookup
          const policyResult = await query(
              `SELECT get_applicable_commission_policy($1, $2, $3, $4) as policy_id`,
              [attendantId, item.product_id || null, newDate, item.sale_type] // USE NEW DATE
          );

          if (policyResult.rows.length > 0 && policyResult.rows[0].policy_id) {
              const policyId = policyResult.rows[0].policy_id;
              const policyDetails = await query(`SELECT * FROM commission_policies WHERE id = $1`, [policyId]);
              
              if (policyDetails.rows.length > 0) {
                  const p = policyDetails.rows[0];
                  // Handling commission type variants (type vs commission_type)
                  itemCommissionType = p.type || p.commission_type || 'percentage'; 
                  itemCommissionRate = parseFloat(p.value || p.commission_value || 0);

                  if (itemCommissionType === 'fixed_per_unit') {
                      itemCommission = itemCommissionRate * item.quantity;
                  } else {
                      itemCommission = baseValue * (itemCommissionRate / 100);
                  }
              }
          } else {
              // Fallback 5%
              itemCommission = baseValue * 0.05;
          }

          // INSERT New Commission
          await query(
              `INSERT INTO commissions (
                  sale_id,
                  sale_item_id,
                  user_id,
                  base_amount,
                  commission_type,
                  commission_rate,
                  commission_amount,
                  reference_date,
                  status,
                  created_at 
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'a_pagar', NOW())`,
              [
                  saleId,
                  item.item_id,
                  attendantId,
                  baseValue,
                  itemCommissionType,
                  itemCommissionRate,
                  itemCommission,
                  newDate // Use new date
              ]
          );
      }

      await query("COMMIT");
      return NextResponse.json({ success: true, message: "Date updated and commissions recalculated" });

    } catch (err) {
      await query("ROLLBACK");
      throw err;
    }

  } catch (error: any) {
    console.error("[UPDATE SALE DATE ERROR]", error);
    return NextResponse.json(
      { error: error.message || "Erro ao atualizar data" },
      { status: 500 }
    );
  }
}
