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
      // 1. Get Sale Details & Items
      const saleResult = await query(
        `SELECT s.id, s.client_id as carrier_id, s.attendant_id, s.sale_type, 
                si.quantity, si.product_id, p.service_id
         FROM sales s
         LEFT JOIN sale_items si ON s.id = si.sale_id
         LEFT JOIN products p ON si.product_id = p.id
         WHERE s.id = $1`,
        [saleId]
      );

      if (saleResult.rowCount === 0) {
        await query("ROLLBACK");
        return NextResponse.json(
          { error: "Venda nao encontrada" },
          { status: 404 }
        );
      }

      // Group items (assuming items belong to same service/package logic usually)
      const saleData = saleResult.rows[0];
      const items = saleResult.rows;

      // 2. Handle Unified Wallet Reversal
      if (saleData.sale_type === "02") {
          // TYPE 02: Package Purchase (Top-up)
          // We must DECREMENT the wallet balance
          // Logic: Group items by service_id and decrement respective wallets
          
          const creditsByService: Record<string, number> = {};
          
          for (const item of items) {
              if (item.service_id) {
                  const qty = Number(item.quantity || 0);
                  creditsByService[item.service_id] = (creditsByService[item.service_id] || 0) + qty;
              }
          }

          const carrierId = saleData.carrier_id;

          for (const [serviceId, totalCredits] of Object.entries(creditsByService)) {
              if (totalCredits > 0) {
                 // Decrement Wallet for this Service
                 await query(
                     `UPDATE client_packages 
                      SET available_quantity = available_quantity - $1,
                          initial_quantity = initial_quantity - $1,
                          updated_at = NOW()
                      WHERE client_id = $2 AND service_id = $3 AND is_active = true`,
                     [totalCredits, carrierId, serviceId]
                 );
              }
          }
      } else if (saleData.sale_type === "03") {
          // TYPE 03: Package Consumption
          // We must REFUND the wallet (Increment balance)
          // And DELETE existing consumption records

          // 2a. Get consumption details from package_consumptions table (most accurate)
          const consumptionResult = await query(
              `SELECT package_id, quantity FROM package_consumptions WHERE sale_id = $1`,
              [saleId]
          );

          for (const consumption of consumptionResult.rows) {
              // Refund Client Package
              await query(
                  `UPDATE client_packages
                   SET available_quantity = available_quantity + $1,
                       consumed_quantity = consumed_quantity - $1,
                       updated_at = NOW()
                   WHERE id = $2`,
                  [consumption.quantity, consumption.package_id]
              );
          }

          // 2b. Delete Consumption Records
          await query("DELETE FROM package_consumptions WHERE sale_id = $1", [saleId]);
      } else {
         // Check if this sale had any related package_consumptions (orphan check)
         await query("DELETE FROM package_consumptions WHERE sale_id = $1", [saleId]);
      }

      // 2.5 Handle Genesis Package Deletion (If this sale CREATED a wallet)
      const packageResult = await query(
        "SELECT id, consumed_quantity FROM client_packages WHERE sale_id = $1",
        [saleId]
      );

      if (packageResult.rowCount > 0) {
        // Verificar se ALGUM pacote ja foi consumido
        const usedPackages = packageResult.rows.filter((pkg: any) => pkg.consumed_quantity > 0);
        
        if (usedPackages.length > 0) {
          await query("ROLLBACK");
          return NextResponse.json(
            { error: "Nao e possivel excluir esta venda pois um ou mais pacotes gerados ja foram utilizados. Estorne os consumos primeiro." },
            { status: 400 }
          );
        }

        // Se nenhum foi consumido, deletar TODOS os pacotes (Genesis)
        for (const pkg of packageResult.rows) {
            await query("DELETE FROM client_packages WHERE id = $1", [pkg.id]);
        }
      }

      // 3. Delete Dependencies (Speculative Cleanup for hidden constraints)
      const potentialTables = ['financial_transactions', 'notifications', 'invoices', 'commission_payments', 'logs'];
      for (const table of potentialTables) {
          try {
              // Try to delete if table exists (blind shot)
              await query(`DELETE FROM ${table} WHERE sale_id = $1`, [saleId]);
          } catch (ignored) {
              // Table likely doesn't exist or no column sale_id
          }
      }

      await query("DELETE FROM commissions WHERE sale_id = $1", [saleId]);
      
      try {
        await query("DELETE FROM sale_refunds WHERE sale_id = $1", [saleId]);
      } catch (e) { /* ignore */ }
      
      await query("DELETE FROM sale_items WHERE sale_id = $1", [saleId]);

      // 4. Delete Sale
      await query("DELETE FROM sales WHERE id = $1", [saleId]);

      await query("COMMIT");

      return NextResponse.json(
        { message: "Venda excluida permanentemente" },
        { status: 200 }
      );
    } catch (error: any) {
      await query("ROLLBACK");
      console.error("DELETE TRANSACTION ERROR:", {
          message: error.message,
          code: error.code,
          detail: error.detail,
          constraint: error.constraint,
          stack: error.stack
      });
      throw error;
    }
  } catch (error: any) {
    console.error("Erro ao excluir venda (Outer Catch):", error);
    const message = error.message || "Erro ao excluir venda";
    
    // Construct a detailed error message for the frontend
    const details = [
        error.detail,
        error.constraint ? `Constraint: ${error.constraint}` : null,
        error.table ? `Table: ${error.table}` : null
    ].filter(Boolean).join(" | ");

    const status = message.includes("autenticacao") ? 401 : 500;
    
    return NextResponse.json({ 
        error: message, 
        details: details || undefined 
    }, { status });
  }
}
