import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type DecodedToken = {
  userId: string;
};

type AuthenticatedUser = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_admin: boolean;
};

const getTokenFromRequest = (request: NextRequest) => {
  const cookieToken = request.cookies.get("token")?.value;
  if (cookieToken) {
    return cookieToken;
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  return null;
};

const authenticateUser = async (request: NextRequest): Promise<AuthenticatedUser> => {
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Error("Token de autenticacao nao informado");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;

    const result = await query(
      `SELECT id, first_name, last_name, email, is_admin
       FROM users
       WHERE id = $1`,
      [decoded.userId]
    );

    const user = result.rows[0];
    if (!user) {
      throw new Error("Usuario nao encontrado");
    }

    return user;
  } catch (error) {
    console.error("Falha na autenticacao:", error);
    throw new Error("Falha na autenticacao");
  }
};

// POST - Registrar estorno financeiro de uma venda
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateUser(request);
    const { saleId, amount, reason } = await request.json();

    if (!saleId) {
      return NextResponse.json(
        { error: "ID da venda e obrigatorio" },
        { status: 400 }
      );
    }

    const refundAmount = Number(amount);
    if (isNaN(refundAmount) || refundAmount <= 0) {
      return NextResponse.json(
        { error: "Valor de estorno deve ser maior que zero" },
        { status: 400 }
      );
    }

    await query("BEGIN");

    try {
      // Buscar venda para validar permissao e valores
      let hasRefundSupport = true;
      let saleResult;
      try {
        saleResult = await query(
          `SELECT id, attendant_id, status, total, refund_total, commission_policy_id, commission_amount, sale_date
           FROM sales
           WHERE id = $1`,
          [saleId]
        );
      } catch (err: any) {
        const msg = err?.message || "";
        if (msg.includes("refund_total") || msg.includes("sale_refunds")) {
          hasRefundSupport = false;
          await query("ROLLBACK");
          return NextResponse.json(
            {
              error:
                "Funcionalidade de estorno indisponivel: execute a migration 012_add_sale_refunds.sql no banco antes de usar estornos.",
            },
            { status: 400 }
          );
        }
        throw err;
      }

      if (saleResult.rowCount === 0) {
        await query("ROLLBACK");
        return NextResponse.json(
          { error: "Venda nao encontrada" },
          { status: 404 }
        );
      }

      const sale = saleResult.rows[0];

      if (sale.status === "cancelada") {
        await query("ROLLBACK");
        return NextResponse.json(
          { error: "Nao e possivel estornar uma venda cancelada" },
          { status: 400 }
        );
      }

      if (!user.is_admin && sale.attendant_id !== user.id) {
        await query("ROLLBACK");
        return NextResponse.json(
          { error: "Voce nao tem permissao para estornar esta venda" },
          { status: 403 }
        );
      }

      const currentTotal = parseFloat(sale.total);
      const currentRefundTotal = parseFloat(sale.refund_total || 0);
      const availableForRefund = currentTotal;

      if (refundAmount > availableForRefund) {
        await query("ROLLBACK");
        return NextResponse.json(
          { error: "Valor de estorno maior que o saldo disponivel" },
          { status: 400 }
        );
      }

      const newRefundTotal = currentRefundTotal + refundAmount;
      const newNetTotal = Math.max(0, currentTotal - refundAmount);

      // Registrar estorno
      await query(
        `INSERT INTO sale_refunds (sale_id, amount, reason, created_by)
         VALUES ($1, $2, $3, $4)`,
        [saleId, refundAmount, reason || null, user.id]
      );

      // Recalcular comissao com base no novo total liquido
      let newCommissionAmount = parseFloat(sale.commission_amount || 0);
      if (sale.commission_policy_id) {
        const commissionResult = await query(
          `SELECT calculate_commission($1, $2, $3) as commission`,
          [saleId, newNetTotal, sale.commission_policy_id]
        );
        if (commissionResult.rows.length > 0) {
          newCommissionAmount = parseFloat(commissionResult.rows[0].commission || 0);
        }
      }

      // Atualizar venda com o novo total e estorno acumulado
      await query(
        `UPDATE sales
         SET refund_total = $1,
             total = $2,
             commission_amount = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [newRefundTotal, newNetTotal, newCommissionAmount, saleId]
      );

      await query("COMMIT");

      return NextResponse.json(
        {
          message: "Estorno registrado com sucesso",
          refundTotal: newRefundTotal,
          total: newNetTotal,
          commissionAmount: newCommissionAmount,
        },
        { status: 200 }
      );
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Erro ao registrar estorno:", error);
    const message = error instanceof Error ? error.message : "Erro ao registrar estorno";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
