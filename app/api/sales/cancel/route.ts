import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {
  calculateAdjustmentIncrement,
  roundMoney,
} from "@/lib/commission-accounting";
import {
  authenticateRequest,
  getAuthErrorStatus,
} from "@/lib/server-auth";

// POST - Cancelar venda e preservar o historico de comissoes pagas.
export async function POST(request: NextRequest) {
  const client = await pool.connect();

  try {
    const user = await authenticateRequest(request);
    const { saleId, reason } = await request.json();

    if (!saleId) {
      return NextResponse.json(
        { error: "ID da venda e obrigatorio" },
        { status: 400 },
      );
    }

    await client.query("BEGIN");
    const saleResult = await client.query(
      `SELECT
         id,
         client_id,
         attendant_id,
         status,
         sale_date,
         total,
         commission_amount
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
        { error: "Esta venda ja foi cancelada" },
        { status: 400 },
      );
    }

    if (!user.is_admin && sale.attendant_id !== user.id) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Voce nao tem permissao para cancelar esta venda" },
        { status: 403 },
      );
    }

    const commissionsResult = await client.query(
      `SELECT id, status, commission_amount
       FROM commissions
       WHERE sale_id = $1
         AND status != 'cancelado'
       ORDER BY created_at, id
       FOR UPDATE`,
      [saleId],
    );
    const paidCommissionTotal = roundMoney(
      commissionsResult.rows
        .filter((row) => row.status === "pago")
        .reduce(
          (total, row) => total + Number(row.commission_amount || 0),
          0,
        ),
    );

    let adjustmentAmount = 0;
    if (paidCommissionTotal > 0) {
      const previousAdjustments = await client.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM commission_adjustments
         WHERE sale_id = $1
           AND status != 'cancelled'`,
        [saleId],
      );
      adjustmentAmount = calculateAdjustmentIncrement(
        paidCommissionTotal,
        0,
        Number(previousAdjustments.rows[0]?.total || 0),
      );

      if (adjustmentAmount > 0) {
        await client.query(
          `INSERT INTO commission_adjustments (
             user_id,
             sale_id,
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
             DATE_TRUNC(
               'month',
               $3::timestamptz AT TIME ZONE 'America/Sao_Paulo'
             )::date,
             'cancellation',
             $4,
             $5,
             0,
             $6,
             $7,
             $8
           )`,
          [
            sale.attendant_id,
            saleId,
            sale.sale_date,
            roundMoney(Number(sale.total || 0)),
            paidCommissionTotal,
            adjustmentAmount,
            reason || "Cancelamento posterior ao pagamento da comissao",
            user.id,
          ],
        );
      }
    }

    await client.query(
      `UPDATE sales
       SET status = 'cancelada',
           cancelled_at = CURRENT_TIMESTAMP,
           commission_amount = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [saleId],
    );

    await client.query(
      `UPDATE commissions
       SET status = 'cancelado',
           updated_at = CURRENT_TIMESTAMP
       WHERE sale_id = $1
         AND status = 'a_pagar'`,
      [saleId],
    );

    const consumptionResult = await client.query(
      `SELECT package_id, quantity
       FROM package_consumptions
       WHERE sale_id = $1`,
      [saleId],
    );
    for (const consumption of consumptionResult.rows) {
      await client.query(
        `UPDATE client_packages
         SET available_quantity = available_quantity + $1,
             consumed_quantity = consumed_quantity - $1,
             updated_at = NOW()
         WHERE id = $2`,
        [consumption.quantity, consumption.package_id],
      );
    }

    const genesisResult = await client.query(
      `SELECT id
       FROM client_packages
       WHERE sale_id = $1`,
      [saleId],
    );
    for (const clientPackage of genesisResult.rows) {
      await client.query(
        `UPDATE client_packages
         SET available_quantity = available_quantity - initial_quantity,
             initial_quantity = 0,
             is_active = false,
             updated_at = NOW()
         WHERE id = $1`,
        [clientPackage.id],
      );
    }

    await client.query("COMMIT");
    return NextResponse.json(
      {
        message:
          adjustmentAmount > 0
            ? "Venda cancelada e ajuste de comissao criado"
            : "Venda cancelada com sucesso",
        adjustmentAmount,
      },
      { status: 200 },
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors.
    }

    const message =
      error instanceof Error ? error.message : "Erro ao cancelar venda";
    const missingMigration =
      message.includes("commission_adjustments") ||
      message.includes("does not exist");
    return NextResponse.json(
      {
        error: missingMigration
          ? "A migracao 017 de ajustes de comissao ainda nao foi aplicada"
          : message,
      },
      {
        status: missingMigration ? 503 : getAuthErrorStatus(error),
      },
    );
  } finally {
    client.release();
  }
}
