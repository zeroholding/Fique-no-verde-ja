import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
import {
  calculatePaymentAmounts,
  getNextMonth,
  getScheduledPaymentDate,
  getTodayInSaoPaulo,
  isValidDate,
  isValidMonth,
  roundMoney,
} from "@/lib/commission-accounting";
import { getAuthErrorStatus, requireAdmin } from "@/lib/server-auth";

type PaymentPreview = {
  userId: string;
  competenceMonth: string;
  scheduledPaymentDate: string;
  paymentDate: string;
  commissionCount: number;
  grossAmount: number;
  pendingAdjustmentAmount: number;
  adjustmentAmount: number;
  netAmount: number;
  alreadyPaid: boolean;
  canPay: boolean;
  error: string | null;
};

function validatePaymentInput(
  userId: string,
  competenceMonth: string,
  paymentDate: string,
): string | null {
  if (!userId || !isValidMonth(competenceMonth) || !isValidDate(paymentDate)) {
    return "Atendente, competencia e data de pagamento sao obrigatorios";
  }

  const scheduledPaymentDate = getScheduledPaymentDate(competenceMonth);
  if (paymentDate < scheduledPaymentDate) {
    return `O pagamento desta competencia so pode ser registrado a partir de ${scheduledPaymentDate}`;
  }

  if (paymentDate > getTodayInSaoPaulo()) {
    return "A data efetiva do pagamento nao pode estar no futuro";
  }

  return null;
}

async function buildPreview(
  client: PoolClient,
  userId: string,
  competenceMonth: string,
  paymentDate: string,
  lockRows = false,
): Promise<
  PaymentPreview & {
    commissionIds: string[];
    adjustments: Array<{
      id: string;
      amount: number;
      appliedAmount: number;
    }>;
  }
> {
  const competenceStart = `${competenceMonth}-01`;
  const competenceEnd = getNextMonth(competenceMonth);
  const scheduledPaymentDate = getScheduledPaymentDate(competenceMonth);
  const lockClause = lockRows ? "FOR UPDATE" : "";

  const existing = await client.query(
    `SELECT id
     FROM commission_payments
     WHERE user_id = $1
       AND competence_month = $2::date
       AND status = 'paid'
     ${lockClause}`,
    [userId, competenceStart],
  );

  const commissionsResult = await client.query(
    `SELECT id, commission_amount
     FROM commissions
     WHERE user_id = $1
       AND (reference_date AT TIME ZONE 'America/Sao_Paulo')::date >= $2::date
       AND (reference_date AT TIME ZONE 'America/Sao_Paulo')::date < $3::date
       AND status = 'a_pagar'
     ORDER BY reference_date, created_at
     ${lockClause}`,
    [userId, competenceStart, competenceEnd],
  );

  const adjustmentsResult = await client.query(
    `SELECT id, amount, applied_amount
     FROM commission_adjustments
     WHERE user_id = $1
       AND status IN ('pending', 'partially_applied')
       AND amount > applied_amount
       AND created_at::date <= $2::date
     ORDER BY created_at, id
     ${lockClause}`,
    [userId, paymentDate],
  );

  const grossAmount = roundMoney(
    commissionsResult.rows.reduce(
      (total, row) => total + Number(row.commission_amount || 0),
      0,
    ),
  );
  const adjustments = adjustmentsResult.rows.map((row) => ({
    id: String(row.id),
    amount: Number(row.amount || 0),
    appliedAmount: Number(row.applied_amount || 0),
  }));
  const pendingAdjustmentAmount = roundMoney(
    adjustments.reduce(
      (total, adjustment) =>
        total + adjustment.amount - adjustment.appliedAmount,
      0,
    ),
  );
  const { adjustmentAmount, netAmount } = calculatePaymentAmounts(
    grossAmount,
    pendingAdjustmentAmount,
  );
  const alreadyPaid = Boolean(existing.rowCount);
  const error = alreadyPaid
    ? "Esta competencia ja possui pagamento registrado"
    : commissionsResult.rowCount === 0 || grossAmount <= 0
      ? "Nao existem comissoes pendentes nesta competencia"
      : null;

  return {
    userId,
    competenceMonth,
    scheduledPaymentDate,
    paymentDate,
    commissionCount: commissionsResult.rowCount || 0,
    commissionIds: commissionsResult.rows.map((row) => String(row.id)),
    adjustments,
    grossAmount,
    pendingAdjustmentAmount,
    adjustmentAmount,
    netAmount,
    alreadyPaid,
    canPay: !error,
    error,
  };
}

export async function GET(request: NextRequest) {
  const client = await pool.connect();
  try {
    await requireAdmin(request);
    const searchParams = new URL(request.url).searchParams;

    if (searchParams.get("preview") === "true") {
      const userId = searchParams.get("userId") || "";
      const competenceMonth = searchParams.get("competenceMonth") || "";
      const paymentDate = searchParams.get("paymentDate") || "";
      const validationError = validatePaymentInput(
        userId,
        competenceMonth,
        paymentDate,
      );
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      const preview = await buildPreview(
        client,
        userId,
        competenceMonth,
        paymentDate,
      );
      return NextResponse.json({
        preview: {
          userId: preview.userId,
          competenceMonth: preview.competenceMonth,
          scheduledPaymentDate: preview.scheduledPaymentDate,
          paymentDate: preview.paymentDate,
          commissionCount: preview.commissionCount,
          grossAmount: preview.grossAmount,
          pendingAdjustmentAmount: preview.pendingAdjustmentAmount,
          adjustmentAmount: preview.adjustmentAmount,
          netAmount: preview.netAmount,
          alreadyPaid: preview.alreadyPaid,
          canPay: preview.canPay,
          error: preview.error,
        },
      });
    }

    const result = await client.query(
      `SELECT
         cp.id,
         cp.user_id,
         cp.competence_month,
         cp.scheduled_payment_date,
         cp.payment_date,
         cp.gross_commission_amount,
         cp.adjustment_amount,
         cp.net_paid_amount,
         cp.status,
         cp.notes,
         cp.created_at,
         u.first_name || ' ' || u.last_name AS attendant_name,
         COUNT(c.id)::int AS commission_count
       FROM commission_payments cp
       JOIN users u ON u.id = cp.user_id
       LEFT JOIN commissions c ON c.commission_payment_id = cp.id
       GROUP BY cp.id, u.first_name, u.last_name
       ORDER BY cp.competence_month DESC, attendant_name ASC`,
    );

    return NextResponse.json({
      payments: result.rows.map((row) => ({
        ...row,
        gross_commission_amount: Number(row.gross_commission_amount),
        adjustment_amount: Number(row.adjustment_amount),
        net_paid_amount: Number(row.net_paid_amount),
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao listar pagamentos";
    const missingMigration =
      message.includes("commission_payments") ||
      message.includes("commission_payment_id") ||
      message.includes("does not exist");
    return NextResponse.json(
      {
        error: missingMigration
          ? "A migracao 017 de pagamentos de comissao ainda nao foi aplicada"
          : message,
      },
      { status: missingMigration ? 503 : getAuthErrorStatus(error) },
    );
  } finally {
    client.release();
  }
}

export async function POST(request: NextRequest) {
  const client = await pool.connect();
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const userId = String(body.userId || "");
    const competenceMonth = String(body.competenceMonth || "");
    const paymentDate = String(body.paymentDate || "");
    const notes = body.notes ? String(body.notes).trim() : null;
    const validationError = validatePaymentInput(
      userId,
      competenceMonth,
      paymentDate,
    );

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    await client.query("BEGIN");
    const preview = await buildPreview(
      client,
      userId,
      competenceMonth,
      paymentDate,
      true,
    );

    if (!preview.canPay) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: preview.error },
        { status: preview.alreadyPaid ? 409 : 400 },
      );
    }

    const competenceStart = `${competenceMonth}-01`;
    const paymentResult = await client.query(
      `INSERT INTO commission_payments (
         user_id,
         competence_month,
         scheduled_payment_date,
         payment_date,
         gross_commission_amount,
         adjustment_amount,
         net_paid_amount,
         status,
         notes,
         created_by
       ) VALUES ($1, $2, $3, $4, $5, 0, $5, 'paid', $6, $7)
       RETURNING id`,
      [
        userId,
        competenceStart,
        preview.scheduledPaymentDate,
        paymentDate,
        preview.grossAmount,
        notes,
        admin.id,
      ],
    );

    const paymentId = String(paymentResult.rows[0].id);
    let remainingCapacity = preview.grossAmount;
    let appliedAdjustments = 0;

    for (const adjustment of preview.adjustments) {
      if (remainingCapacity <= 0) {
        break;
      }

      const remainingAdjustment = roundMoney(
        adjustment.amount - adjustment.appliedAmount,
      );
      const amountToApply = roundMoney(
        Math.min(remainingAdjustment, remainingCapacity),
      );
      if (amountToApply <= 0) {
        continue;
      }

      await client.query(
        `INSERT INTO commission_payment_adjustments (
           payment_id,
           adjustment_id,
           amount_applied
         ) VALUES ($1, $2, $3)`,
        [paymentId, adjustment.id, amountToApply],
      );

      await client.query(
        `UPDATE commission_adjustments
         SET applied_amount = ROUND(applied_amount + $1, 2),
             status = CASE
               WHEN ROUND(applied_amount + $1, 2) >= amount THEN 'applied'
               ELSE 'partially_applied'
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [amountToApply, adjustment.id],
      );

      appliedAdjustments = roundMoney(appliedAdjustments + amountToApply);
      remainingCapacity = roundMoney(remainingCapacity - amountToApply);
    }

    await client.query(
      `UPDATE commissions
       SET status = 'pago',
           payment_date = $1,
           commission_payment_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($3::uuid[])`,
      [paymentDate, paymentId, preview.commissionIds],
    );

    const netAmount = roundMoney(
      Math.max(0, preview.grossAmount - appliedAdjustments),
    );
    await client.query(
      `UPDATE commission_payments
       SET adjustment_amount = $1,
           net_paid_amount = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [appliedAdjustments, netAmount, paymentId],
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        success: true,
        payment: {
          id: paymentId,
          grossAmount: preview.grossAmount,
          adjustmentAmount: appliedAdjustments,
          netAmount,
          commissionCount: preview.commissionCount,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection may already be outside a transaction.
    }

    const message =
      error instanceof Error ? error.message : "Erro ao registrar pagamento";
    const databaseError = error as { code?: string };
    const missingMigration =
      message.includes("commission_payments") ||
      message.includes("commission_adjustments") ||
      message.includes("commission_payment_id") ||
      message.includes("does not exist");
    return NextResponse.json(
      {
        error:
          databaseError.code === "23505"
            ? "Esta competencia ja possui pagamento registrado"
            : missingMigration
              ? "A migracao 017 de comissoes ainda nao foi aplicada"
              : message,
      },
      {
        status:
          databaseError.code === "23505"
            ? 409
            : missingMigration
              ? 503
              : getAuthErrorStatus(error),
      },
    );
  } finally {
    client.release();
  }
}
