
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

export async function POST(request: NextRequest) {
  try {
    // 1. Auth Check
    const token = request.headers.get("authorization")?.split(" ")[1];
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!decoded.userId) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    // Verify Admin
    const userRes = await query("SELECT is_admin FROM users WHERE id = $1", [decoded.userId]);
    if (!userRes.rows[0]?.is_admin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Find eligible sales without commissions
    // We target sale_items of type 01 or 03 (Not 02), confirmed (not cancelled), 
    // where no commission exists for this item.
    const missingItemsResult = await query(`
      SELECT 
        s.id as sale_id, 
        s.created_at::DATE as sale_date,
        si.id as item_id,
        si.product_id,
        si.quantity,
        si.sale_type,
        si.subtotal as item_base_value, 
        s.user_id as attendant_id
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id
      WHERE si.sale_type IN ('01', '03')
        AND s.status != 'cancelada'
        AND NOT EXISTS (
           SELECT 1 FROM commissions c WHERE c.sale_item_id = si.id
        )
      LIMIT 100
    `);

    const itemsToProcess = missingItemsResult.rows;
    const results = { processed: 0, created: 0, errors: 0 };

    for (const item of itemsToProcess) {
        try {
            results.processed++;
            
            const saleDate = item.sale_date; 
            const attendantId = item.attendant_id;
            
            let itemCommission = 0;
            let itemCommissionType = 'percentage';
            let itemCommissionRate = 5.00;

            // Policy Lookup
            const policyResult = await query(
                `SELECT get_applicable_commission_policy($1, $2, $3, $4) as policy_id`,
                [attendantId, item.product_id || null, saleDate, item.sale_type]
            );

            if (policyResult.rows.length > 0 && policyResult.rows[0].policy_id) {
                const policyId = policyResult.rows[0].policy_id;
                const policyDetails = await query(`SELECT * FROM commission_policies WHERE id = $1`, [policyId]);
                
                if (policyDetails.rows.length > 0) {
                    const p = policyDetails.rows[0];
                    itemCommissionType = p.type;
                    itemCommissionRate = parseFloat(p.value);

                    if (p.type === 'fixed_per_unit') {
                        itemCommission = itemCommissionRate * item.quantity;
                    } else {
                        itemCommission = Number(item.item_base_value) * (itemCommissionRate / 100);
                    }
                }
            } else {
                // Should we insert 0 commission or fallback?
                // Sales route had a fallback of 5%. We should mimic that or insert 0?
                // The issue was they were NOT inserted. 
                // Let's assume fallback of 5% is standard behavior in this system logic.
                // Or I can be safer and insert 0 if no policy?
                // Given the user wants to see them, and previously logic HAD a fallback else block, I will use fallback 5%.
                itemCommission = Number(item.item_base_value) * 0.05;
            }

            // INSERT
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
                    status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'a_pagar')`,
                [
                    item.sale_id,
                    item.item_id,
                    attendantId,
                    Number(item.item_base_value),
                    itemCommissionType,
                    itemCommissionRate,
                    itemCommission,
                    saleDate
                ]
            );
            results.created++;

        } catch (err) {
            console.error(`Error regenerating commission for item ${item.item_id}:`, err);
            results.errors++;
        }
    }

    return NextResponse.json({ 
        message: "Regeneration process completed", 
        stats: results,
        remaining: itemsToProcess.length === 100 ? "More items might exist" : "All done"
    });

  } catch (error: any) {
    console.error("Regeneration API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Error" }, { status: 500 });
  }
}
