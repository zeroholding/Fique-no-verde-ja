import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {
  isAccountingIntegrityError,
  isCompetenceClosed,
  isValidDate,
  roundMoney,
} from "@/lib/commission-accounting";
import { getAuthErrorStatus, requireAdmin } from "@/lib/server-auth";

// PUT /api/sales/[id]/date
export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const client = await pool.connect();

  try {
    await requireAdmin(request);
    const { id: saleId } = await props.params;
    const body = await request.json();
    const saleDate = String(body.saleDate || "");

    if (!isValidDate(saleDate)) {
      return NextResponse.json({ error: "Data invalida" }, { status: 400 });
    }

    await client.query("BEGIN");
    const saleResult = await client.query(
      `SELECT id, attendant_id, sale_date, status
       FROM sales
       WHERE id = $1
       FOR UPDATE`,
      [saleId],
    );

    if (saleResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Venda nao encontrada" },
        { status: 404 },
      );
    }

    const sale = saleResult.rows[0];
    if (sale.status === "cancelada") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Nao e possivel alterar a data de uma venda cancelada" },
        { status: 400 },
      );
    }

    const protectedHistory = await client.query(
      `SELECT
         EXISTS (
           SELECT 1
           FROM commissions
           WHERE sale_id = $1
             AND status = 'pago'
         ) AS has_paid_commission,
         EXISTS (
           SELECT 1
           FROM commission_adjustments
           WHERE sale_id = $1
             AND status != 'cancelled'
         ) AS has_adjustment`,
      [saleId],
    );

    if (
      protectedHistory.rows[0]?.has_paid_commission ||
      protectedHistory.rows[0]?.has_adjustment
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error:
            "A data nao pode ser alterada porque a venda possui historico de comissao paga ou ajuste",
        },
        { status: 409 },
      );
    }

    if (
      await isCompetenceClosed(
        client,
        String(sale.attendant_id),
        `${saleDate}T12:00:00-03:00`,
      )
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error:
            "A data escolhida pertence a uma competencia de comissao ja paga",
        },
        { status: 409 },
      );
    }

    const updatedSale = await client.query(
      `UPDATE sales
       SET sale_date = (
         $1::date +
         (sale_date AT TIME ZONE 'America/Sao_Paulo')::time
       ) AT TIME ZONE 'America/Sao_Paulo',
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING sale_date`,
      [saleDate, saleId],
    );
    const newSaleDate = updatedSale.rows[0].sale_date;

    await client.query(
      `DELETE FROM commissions
       WHERE sale_id = $1
         AND status != 'pago'`,
      [saleId],
    );

    const itemsResult = await client.query(
      `SELECT
         s.attendant_id,
         si.id AS item_id,
         si.product_id,
         si.product_name,
         si.quantity,
         si.sale_type,
         si.total,
         si.subtotal
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       WHERE s.id = $1
         AND si.sale_type IN ('01', '03')`,
      [saleId],
    );

    let totalCommission = 0;
    let firstPolicyId: string | null = null;

    for (const item of itemsResult.rows) {
      const baseAmount = Number(
        item.sale_type === "03" ? item.subtotal : item.total,
      );
      // O 5o argumento e o nome do servico, que habilita a politica por
      // servico (ex.: Reclamacao 3,5% em dia util).
      const policyResult = await client.query(
        `SELECT get_applicable_commission_policy(
           $1,
           $2,
           $3::date,
           $4,
           $5
         ) AS policy_id`,
        [
          item.attendant_id,
          item.product_id || null,
          saleDate,
          item.sale_type,
          item.product_name || null,
        ],
      );
      const policyId = policyResult.rows[0]?.policy_id || null;
      let commissionType = "percentage";
      let commissionRate = 5;
      let commissionAmount = baseAmount * 0.05;

      if (policyId) {
        const policyDetails = await client.query(
          `SELECT type, value
           FROM commission_policies
           WHERE id = $1`,
          [policyId],
        );
        const policy = policyDetails.rows[0];
        if (policy) {
          commissionType = policy.type;
          commissionRate = Number(policy.value);
          commissionAmount =
            policy.type === "fixed_per_unit"
              ? Number(item.quantity || 0) * commissionRate
              : baseAmount * (commissionRate / 100);
          firstPolicyId = firstPolicyId || String(policyId);
        }
      }

      commissionAmount = roundMoney(commissionAmount);
      totalCommission = roundMoney(totalCommission + commissionAmount);

      await client.query(
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
           commission_policy_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'a_pagar', $9)`,
        [
          saleId,
          item.item_id,
          item.attendant_id,
          roundMoney(baseAmount),
          commissionType,
          commissionRate,
          commissionAmount,
          newSaleDate,
          policyId,
        ],
      );
    }

    await client.query(
      `UPDATE sales
       SET commission_amount = $1,
           commission_policy_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [totalCommission, firstPolicyId, saleId],
    );

    await client.query("COMMIT");
    return NextResponse.json({
      success: true,
      message: "Data atualizada e comissoes pendentes recalculadas",
      commissionAmount: totalCommission,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors.
    }

    const message =
      error instanceof Error ? error.message : "Erro ao atualizar data";
    const missingMigration =
      message.includes("commission_adjustments") ||
      message.includes("commission_payments") ||
      message.includes("commission_policy_id") ||
      message.includes("does not exist");
    return NextResponse.json(
      {
        error: missingMigration
          ? "A migracao 017 de comissoes ainda nao foi aplicada"
          : isAccountingIntegrityError(error)
            ? "A operacao alteraria uma competencia fechada ou comissao paga"
            : message,
      },
      {
        status: missingMigration
          ? 503
          : isAccountingIntegrityError(error)
            ? 409
            : getAuthErrorStatus(error),
      },
    );
  } finally {
    client.release();
  }
}
