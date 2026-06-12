import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthErrorStatus, requireAdmin } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const attendantId = searchParams.get("attendantId");
    const status = searchParams.get("status");

    const clauses: string[] = ["1=1"];
    const params: unknown[] = [];

    if (attendantId) {
      params.push(attendantId);
      clauses.push(`ca.user_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      clauses.push(`ca.status = $${params.length}`);
    }

    const result = await query(
      `SELECT
         ca.id,
         ca.user_id,
         ca.sale_id,
         ca.refund_id,
         ca.origin_competence,
         ca.adjustment_type,
         ca.refund_amount,
         ca.commission_before,
         ca.commission_after,
         ca.amount,
         ca.applied_amount,
         ca.amount - ca.applied_amount AS remaining_amount,
         ca.status,
         ca.reason,
         ca.created_at,
         u.first_name || ' ' || u.last_name AS attendant_name,
         s.sale_number,
         s.sale_date,
         cl.name AS client_name,
         COALESCE(sr.created_at, ca.created_at) AS refund_date,
         COALESCE(applications.items, '[]'::json) AS applied_payments
       FROM commission_adjustments ca
       JOIN users u ON u.id = ca.user_id
       JOIN sales s ON s.id = ca.sale_id
       LEFT JOIN clients cl ON cl.id = s.client_id
       LEFT JOIN sale_refunds sr ON sr.id = ca.refund_id
       LEFT JOIN LATERAL (
         SELECT JSON_AGG(
           JSON_BUILD_OBJECT(
             'paymentId', cp.id,
             'competenceMonth', cp.competence_month,
             'paymentDate', cp.payment_date,
             'amountApplied', cpa.amount_applied
           )
           ORDER BY cp.payment_date, cp.id
         ) AS items
         FROM commission_payment_adjustments cpa
         JOIN commission_payments cp ON cp.id = cpa.payment_id
         WHERE cpa.adjustment_id = ca.id
       ) applications ON true
       WHERE ${clauses.join(" AND ")}
       ORDER BY ca.created_at DESC`,
      params,
    );

    const summaryResult = await query(
      `SELECT
         COALESCE(SUM(ca.amount), 0)::numeric AS total_amount,
         COALESCE(SUM(ca.applied_amount), 0)::numeric AS total_applied,
         COALESCE(SUM(ca.amount - ca.applied_amount)
           FILTER (WHERE ca.status IN ('pending', 'partially_applied')), 0)::numeric
           AS total_pending
       FROM commission_adjustments ca
       WHERE ${clauses.join(" AND ")}
         AND ca.status != 'cancelled'`,
      params,
    );

    return NextResponse.json({
      adjustments: result.rows.map((row) => ({
        ...row,
        refund_amount: Number(row.refund_amount),
        commission_before: Number(row.commission_before),
        commission_after: Number(row.commission_after),
        amount: Number(row.amount),
        applied_amount: Number(row.applied_amount),
        remaining_amount: Number(row.remaining_amount),
        applied_payments: (row.applied_payments || []).map(
          (payment: {
            paymentId: string;
            competenceMonth: string;
            paymentDate: string;
            amountApplied: string | number;
          }) => ({
            ...payment,
            amountApplied: Number(payment.amountApplied),
          }),
        ),
      })),
      summary: {
        totalAmount: Number(summaryResult.rows[0]?.total_amount || 0),
        totalApplied: Number(summaryResult.rows[0]?.total_applied || 0),
        totalPending: Number(summaryResult.rows[0]?.total_pending || 0),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao listar ajustes";
    const missingMigration =
      message.includes("commission_adjustments") ||
      message.includes("does not exist");
    return NextResponse.json(
      {
        error: missingMigration
          ? "A migracao 017 de ajustes de comissao ainda nao foi aplicada"
          : message,
      },
      { status: missingMigration ? 503 : getAuthErrorStatus(error) },
    );
  }
}
