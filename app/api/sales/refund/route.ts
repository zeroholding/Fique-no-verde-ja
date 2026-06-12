import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {
  calculateAdjustmentIncrement,
  calculateCommissionAfterRefund,
  roundMoney,
} from "@/lib/commission-accounting";
import { authenticateRequest } from "@/lib/server-auth";

type CommissionRow = {
  id: string;
  status: "a_pagar" | "pago" | "cancelado";
  commission_amount: string | number;
  base_amount: string | number;
};

// POST - Registrar estorno financeiro de uma venda.
export async function POST(request: NextRequest) {
  const client = await pool.connect();

  try {
    const user = await authenticateRequest(request);
    const { saleId, amount, reason } = await request.json();

    if (!saleId) {
      return NextResponse.json(
        { error: "ID da venda e obrigatorio" },
        { status: 400 },
      );
    }

    const refundAmount = Number(amount);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      return NextResponse.json(
        { error: "Valor de estorno deve ser maior que zero" },
        { status: 400 },
      );
    }

    await client.query("BEGIN");

    const saleResult = await client.query(
      `SELECT
         id,
         attendant_id,
         status,
         total,
         refund_total,
         commission_amount,
         sale_date
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
        { error: "Nao e possivel estornar uma venda cancelada" },
        { status: 400 },
      );
    }

    if (!user.is_admin && sale.attendant_id !== user.id) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Voce nao tem permissao para estornar esta venda" },
        { status: 403 },
      );
    }

    const currentTotal = Number(sale.total || 0);
    const currentRefundTotal = Number(sale.refund_total || 0);
    if (refundAmount > currentTotal) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Valor de estorno maior que o saldo disponivel" },
        { status: 400 },
      );
    }

    const newRefundTotal = roundMoney(currentRefundTotal + refundAmount);
    const newNetTotal = roundMoney(Math.max(0, currentTotal - refundAmount));

    const refundResult = await client.query(
      `INSERT INTO sale_refunds (sale_id, amount, reason, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [saleId, refundAmount, reason || null, user.id],
    );
    const refund = refundResult.rows[0];

    const commissionsResult = await client.query<CommissionRow>(
      `SELECT id, status, commission_amount, base_amount
       FROM commissions
       WHERE sale_id = $1
         AND status != 'cancelado'
       ORDER BY created_at, id
       FOR UPDATE`,
      [saleId],
    );

    const commissionRows = commissionsResult.rows;
    const commissionRowsTotal = commissionRows.reduce(
      (total, row) => total + Number(row.commission_amount || 0),
      0,
    );
    const currentCommissionAmount =
      sale.commission_amount === null ||
      sale.commission_amount === undefined
        ? commissionRowsTotal
        : Number(sale.commission_amount);
    const newCommissionAmount = calculateCommissionAfterRefund(
      currentCommissionAmount,
      currentTotal,
      newNetTotal,
    );
    const baseRatio = currentTotal > 0 ? newNetTotal / currentTotal : 0;

    const paidRows = commissionRows.filter((row) => row.status === "pago");
    const pendingRows = commissionRows.filter(
      (row) => row.status === "a_pagar",
    );
    const paidCommissionTotal = roundMoney(
      paidRows.reduce(
        (total, row) => total + Number(row.commission_amount || 0),
        0,
      ),
    );

    // Only the unpaid portion can be rewritten. Paid rows are historical.
    const targetPendingTotal = roundMoney(
      Math.max(0, newCommissionAmount - paidCommissionTotal),
    );
    const currentPendingTotal = pendingRows.reduce(
      (total, row) => total + Number(row.commission_amount || 0),
      0,
    );
    let distributedPending = 0;

    for (let index = 0; index < pendingRows.length; index++) {
      const row = pendingRows[index];
      const isLast = index === pendingRows.length - 1;
      const weight =
        currentPendingTotal > 0
          ? Number(row.commission_amount || 0) / currentPendingTotal
          : 1 / pendingRows.length;
      const rowAmount = isLast
        ? roundMoney(targetPendingTotal - distributedPending)
        : roundMoney(targetPendingTotal * weight);
      const rowBase = roundMoney(Number(row.base_amount || 0) * baseRatio);

      await client.query(
        `UPDATE commissions
         SET commission_amount = $1,
             base_amount = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [Math.max(0, rowAmount), Math.max(0, rowBase), row.id],
      );
      distributedPending = roundMoney(distributedPending + rowAmount);
    }

    let adjustmentAmount = 0;
    if (paidCommissionTotal > 0) {
      const adjustmentResult = await client.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM commission_adjustments
         WHERE sale_id = $1
           AND status != 'cancelled'`,
        [saleId],
      );
      const alreadyRegistered = Number(adjustmentResult.rows[0]?.total || 0);
      adjustmentAmount = calculateAdjustmentIncrement(
        paidCommissionTotal,
        newCommissionAmount,
        alreadyRegistered,
      );

      if (adjustmentAmount > 0) {
        await client.query(
          `INSERT INTO commission_adjustments (
             user_id,
             sale_id,
             refund_id,
             origin_competence,
             adjustment_type,
             refund_amount,
             commission_before,
             commission_after,
             amount,
             reason,
             created_by
           ) VALUES (
             $1,
             $2,
             $3,
             DATE_TRUNC(
               'month',
               $4::timestamptz AT TIME ZONE 'America/Sao_Paulo'
             )::date,
             'refund',
             $5,
             $6,
             $7,
             $8,
             $9,
             $10
           )`,
          [
            sale.attendant_id,
            saleId,
            refund.id,
            sale.sale_date,
            refundAmount,
            paidCommissionTotal,
            newCommissionAmount,
            adjustmentAmount,
            reason || "Estorno posterior ao pagamento da comissao",
            user.id,
          ],
        );
      }
    }

    await client.query(
      `UPDATE sales
       SET refund_total = $1,
           total = $2,
           commission_amount = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [newRefundTotal, newNetTotal, newCommissionAmount, saleId],
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        message:
          adjustmentAmount > 0
            ? "Estorno registrado e ajuste de comissao criado"
            : "Estorno registrado com sucesso",
        refundTotal: newRefundTotal,
        total: newNetTotal,
        commissionAmount: newCommissionAmount,
        adjustmentAmount,
        refundId: refund.id,
      },
      { status: 200 },
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors after an early failure.
    }

    console.error("Erro ao registrar estorno:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao registrar estorno";
    const missingMigration =
      message.includes("sale_refunds") ||
      message.includes("refund_total") ||
      message.includes("commission_adjustments") ||
      message.includes("does not exist");

    return NextResponse.json(
      {
        error: missingMigration
          ? "Funcionalidade indisponivel: aplique as migracoes 012 e 017 no banco"
          : message,
      },
      {
        status: missingMigration
          ? 503
          : message.includes("Token") || message.includes("autenticacao")
            ? 401
            : 400,
      },
    );
  } finally {
    client.release();
  }
}
