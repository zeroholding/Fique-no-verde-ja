import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getAuthErrorStatus, requireAdmin } from "@/lib/server-auth";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const client = await pool.connect();
  try {
    await requireAdmin(request);
    const body = await request.json();
    const startDate = String(body.startDate || "");
    const endDate = String(body.endDate || startDate);

    if (!datePattern.test(startDate) || !datePattern.test(endDate)) {
      return NextResponse.json(
        { error: "Informe um periodo valido para recalculo" },
        { status: 400 },
      );
    }

    await client.query("BEGIN");
    const commissionsResult = await client.query(
      `SELECT
         c.id,
         c.sale_id,
         c.sale_item_id,
         c.user_id,
         c.base_amount,
         s.sale_date,
         si.product_id,
         si.product_name,
         si.quantity,
         si.sale_type
       FROM commissions c
       JOIN sales s ON s.id = c.sale_id
       LEFT JOIN sale_items si ON si.id = c.sale_item_id
       WHERE c.status = 'a_pagar'
         AND (c.reference_date AT TIME ZONE 'America/Sao_Paulo')::date
           >= $1::date
         AND (c.reference_date AT TIME ZONE 'America/Sao_Paulo')::date
           <= $2::date
       ORDER BY c.sale_id
       FOR UPDATE OF c`,
      [startDate, endDate],
    );

    const touchedSales = new Set<string>();
    const salePolicies = new Map<string, string>();
    let updated = 0;

    for (const commission of commissionsResult.rows) {
      // O 5o argumento e o nome do servico, que habilita a politica por
      // servico (ex.: Reclamacao 3,5% em dia util). Sem ele, o recalculo
      // devolveria a comissao para a taxa geral.
      const policyResult = await client.query(
        `SELECT get_applicable_commission_policy($1, $2, $3::date, $4, $5) AS policy_id`,
        [
          commission.user_id,
          commission.product_id || null,
          commission.sale_date,
          commission.sale_type || "01",
          commission.product_name || null,
        ],
      );

      const policyId = policyResult.rows[0]?.policy_id;
      if (!policyId) {
        continue;
      }

      const policyResultDetails = await client.query(
        `SELECT type, value FROM commission_policies WHERE id = $1`,
        [policyId],
      );
      const policy = policyResultDetails.rows[0];
      if (!policy) {
        continue;
      }

      const rate = Number(policy.value);
      const baseAmount = Number(commission.base_amount || 0);
      const amount =
        policy.type === "fixed_per_unit"
          ? Number(commission.quantity || 0) * rate
          : baseAmount * (rate / 100);

      await client.query(
        `UPDATE commissions
         SET commission_type = $1,
             commission_rate = $2,
             commission_amount = $3,
             commission_policy_id = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [
          policy.type,
          rate,
          Math.round(amount * 100) / 100,
          policyId,
          commission.id,
        ],
      );

      touchedSales.add(commission.sale_id);
      if (!salePolicies.has(commission.sale_id)) {
        salePolicies.set(commission.sale_id, String(policyId));
      }
      updated++;
    }

    for (const saleId of touchedSales) {
      await client.query(
        `UPDATE sales
         SET commission_amount = (
           SELECT COALESCE(SUM(commission_amount), 0)
           FROM commissions
           WHERE sale_id = $1 AND status != 'cancelado'
         ),
         commission_policy_id = $2,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [saleId, salePolicies.get(saleId) || null],
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({
      success: true,
      updated,
      salesUpdated: touchedSales.size,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors.
    }
    const message =
      error instanceof Error ? error.message : "Erro ao recalcular comissoes";
    return NextResponse.json(
      { error: message },
      { status: getAuthErrorStatus(error) },
    );
  } finally {
    client.release();
  }
}
