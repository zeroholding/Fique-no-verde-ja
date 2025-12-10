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

// GET - Obter detalhes de uma venda específica com seus itens
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const user = await authenticateUser(request);
    const saleId = params.id;

    // Buscar venda (com fallback se o schema ainda nao tiver refund_total)
    let hasRefundSupport = true;
    let saleResult;
    try {
      saleResult = await query(
        `SELECT
          s.id,
          s.client_id,
          s.attendant_id,
          s.sale_date,
          s.observations,
          s.status,
          s.payment_method,
          s.general_discount_type,
          s.general_discount_value,
          s.subtotal,
          s.total_discount,
          s.total,
          s.refund_total,
          s.confirmed_at,
          s.cancelled_at,
          s.created_at,
          s.updated_at,
          c.name as client_name,
          c.phone as client_phone,
          c.email as client_email,
          u.first_name || ' ' || u.last_name as attendant_name
         FROM sales s
         JOIN clients c ON s.client_id = c.id
         JOIN users u ON s.attendant_id = u.id
         WHERE s.id = $1`,
        [saleId]
      );
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("refund_total") || msg.includes("sale_refunds")) {
        hasRefundSupport = false;
        saleResult = await query(
          `SELECT
            s.id,
            s.client_id,
            s.attendant_id,
            s.sale_date,
            s.observations,
            s.status,
            s.payment_method,
            s.general_discount_type,
            s.general_discount_value,
            s.subtotal,
            s.total_discount,
            s.total,
            s.confirmed_at,
            s.cancelled_at,
            s.created_at,
            s.updated_at,
            c.name as client_name,
            c.phone as client_phone,
            c.email as client_email,
            u.first_name || ' ' || u.last_name as attendant_name
           FROM sales s
           JOIN clients c ON s.client_id = c.id
           JOIN users u ON s.attendant_id = u.id
           WHERE s.id = $1`,
          [saleId]
        );
      } else {
        throw err;
      }
    }

    if (saleResult.rowCount === 0) {
      return NextResponse.json(
        { error: "Venda nao encontrada" },
        { status: 404 }
      );
    }

    const sale = saleResult.rows[0];

    // Verificar permissões
    if (!user.is_admin && sale.attendant_id !== user.id) {
      return NextResponse.json(
        { error: "Voce nao tem permissao para visualizar esta venda" },
        { status: 403 }
      );
    }

    // Buscar itens da venda
    const itemsResult = await query(
      `SELECT
        id,
        product_id,
        product_name,
        quantity,
        unit_price,
        discount_type,
        discount_value,
        subtotal,
        discount_amount,
        total,
        created_at
       FROM sale_items
       WHERE sale_id = $1
       ORDER BY created_at ASC`,
      [saleId]
    );

    let refundsResult: any = { rows: [] };
    if (hasRefundSupport) {
      try {
        refundsResult = await query(
          `SELECT
            id,
            amount,
            reason,
            created_by,
            created_at
           FROM sale_refunds
           WHERE sale_id = $1
           ORDER BY created_at DESC`,
          [saleId]
        );
      } catch (err: any) {
        const msg = err?.message || "";
        if (msg.includes("sale_refunds")) {
          hasRefundSupport = false;
          refundsResult = { rows: [] };
        } else {
          throw err;
        }
      }
    }

    // Formatar resposta
    const formattedSale = {
      id: sale.id,
      clientId: sale.client_id,
      clientName: sale.client_name,
      clientPhone: sale.client_phone,
      clientEmail: sale.client_email,
      attendantId: sale.attendant_id,
      attendantName: sale.attendant_name,
      saleDate: sale.sale_date,
      observations: sale.observations,
      status: sale.status,
      paymentMethod: sale.payment_method,
      generalDiscountType: sale.general_discount_type,
      generalDiscountValue: sale.general_discount_value,
      subtotal: parseFloat(sale.subtotal),
      totalDiscount: parseFloat(sale.total_discount),
      total: parseFloat(sale.total),
      refundTotal: hasRefundSupport ? parseFloat(sale.refund_total || 0) : 0,
      confirmedAt: sale.confirmed_at,
      cancelledAt: sale.cancelled_at,
      createdAt: sale.created_at,
      updatedAt: sale.updated_at,
      items: itemsResult.rows.map((item: any) => ({
        id: item.id,
        productId: item.product_id,
        productName: item.product_name,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price),
        discountType: item.discount_type,
        discountValue: parseFloat(item.discount_value || 0),
        subtotal: parseFloat(item.subtotal),
        discountAmount: parseFloat(item.discount_amount),
        total: parseFloat(item.total),
        createdAt: item.created_at,
      })),
      refunds: hasRefundSupport
        ? refundsResult.rows.map((ref: any) => ({
            id: ref.id,
            amount: parseFloat(ref.amount),
            reason: ref.reason,
            createdBy: ref.created_by,
            createdAt: ref.created_at,
          }))
        : [],
    };

    return NextResponse.json({ sale: formattedSale }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel carregar os detalhes da venda";
    const status = message.includes("autenticacao") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE - Excluir venda (Hard Delete)
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const user = await authenticateUser(request);
    const saleId = params.id;

    if (!user.is_admin) {
      return NextResponse.json(
        { error: "Apenas administradores podem excluir vendas" },
        { status: 403 }
      );
    }

    await query("BEGIN");

    try {
      // 1. Verificar se a venda existe e pegar dados basicos
      const saleResult = await query(
        "SELECT id, attendant_id, status FROM sales WHERE id = $1",
        [saleId]
      );

      if (saleResult.rowCount === 0) {
        await query("ROLLBACK");
        return NextResponse.json(
          { error: "Venda nao encontrada" },
          { status: 404 }
        );
      }

      // 2. Verificar se a venda gerou pacote (Compra de Pacote)
      const packageResult = await query(
        "SELECT id, consumed_quantity FROM client_packages WHERE sale_id = $1",
        [saleId]
      );

      if (packageResult.rowCount > 0) {
        const pkg = packageResult.rows[0];
        // Se o pacote gerado ja foi consumido, nao permitir exclusao
        if (pkg.consumed_quantity > 0) {
          await query("ROLLBACK");
          return NextResponse.json(
            { error: "Nao e possivel excluir esta venda pois o pacote gerado ja foi utilizado. Estorne os consumos primeiro." },
            { status: 400 }
          );
        }
        // Se nao foi consumido, deletar o pacote
        await query("DELETE FROM client_packages WHERE id = $1", [pkg.id]);
      }

      // 3. Verificar se a venda foi um Consumo de Pacote
      // Se sim, estornar o consumo para devolver o saldo ao pacote original
      try {
        await query("SELECT refund_package_consumption($1)", [saleId]);
      } catch (refundError) {
        // Ignorar erro se nao houver consumo (funcao pode nao existir ou nao ter nada pra estornar, mas refund_package_consumption costuma ser safe)
        console.log("Info: Tentativa de estorno de consumo retornou:", refundError);
      }

      // 4. Deletar registros dependentes
      await query("DELETE FROM commissions WHERE sale_id = $1", [saleId]);
      
      // Tentar deletar refunds se a tabela existir (tratamento de erro silencioso se nao existir)
      try {
        await query("DELETE FROM sale_refunds WHERE sale_id = $1", [saleId]);
      } catch (e) { /* ignore */ }
      
      await query("DELETE FROM sale_items WHERE sale_id = $1", [saleId]);

      // 5. Deletar a venda
      await query("DELETE FROM sales WHERE id = $1", [saleId]);

      await query("COMMIT");

      return NextResponse.json(
        { message: "Venda excluida permanentemente" },
        { status: 200 }
      );
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Erro ao excluir venda:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao excluir venda";
    const status = message.includes("autenticacao") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
