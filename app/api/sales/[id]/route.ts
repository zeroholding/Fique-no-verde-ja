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

type DbError = Error & {
  code?: string;
  detail?: string;
  constraint?: string;
  table?: string;
};

type SaleItemRow = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: string | number;
  discount_type: string | null;
  discount_value: string | number | null;
  subtotal: string | number;
  discount_amount: string | number;
  total: string | number;
  created_at: string;
  service_id?: string | null;
};

type SaleRefundRow = {
  id: string;
  amount: string | number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "";

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
    } catch (err) {
      const msg = getErrorMessage(err);
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

    let refundsResult: { rows: SaleRefundRow[] } = { rows: [] };
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
      } catch (err) {
        const msg = getErrorMessage(err);
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
      items: itemsResult.rows.map((item: SaleItemRow) => ({
        id: item.id,
        productId: item.product_id,
        productName: item.product_name,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        discountType: item.discount_type,
        discountValue: Number(item.discount_value || 0),
        subtotal: Number(item.subtotal),
        discountAmount: Number(item.discount_amount),
        total: Number(item.total),
        createdAt: item.created_at,
      })),
      refunds: hasRefundSupport
        ? refundsResult.rows.map((ref: SaleRefundRow) => ({
            id: ref.id,
            amount: Number(ref.amount),
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

      // 1. Get Sale Details (Simple Query - Removed sale_type as it might be missing in production DB)
      const saleResult = await query(
        `SELECT id, client_id, attendant_id, CAST(sale_date AS TEXT) as sale_date FROM sales WHERE id = $1`,
        [saleId]
      );

      if (saleResult.rowCount === 0) {
        await query("ROLLBACK");
        return NextResponse.json(
          { error: "Venda nao encontrada" },
          { status: 404 }
        );
      }

      const saleData = saleResult.rows[0];

      const paidCommissionResult = await query(
        `SELECT 1
         FROM commissions
         WHERE sale_id = $1
           AND status = 'pago'
         LIMIT 1`,
        [saleId],
      );
      if (paidCommissionResult.rowCount > 0) {
        await query("ROLLBACK");
        return NextResponse.json(
          {
            error:
              "Venda com comissao paga nao pode ser excluida. Use o cancelamento para gerar o ajuste financeiro.",
          },
          { status: 409 },
        );
      }

      // 1b. Get Items (inclui sale_type para identificar recargas Tipo 02)
      // Obs: sale_items NAO possui service_id em producao, entao nao referenciamos.
      const itemsResult = await query(
        `SELECT si.quantity, si.product_id, si.sale_type
         FROM sale_items si
         WHERE si.sale_id = $1`,
        [saleId]
      );
      
      const items = itemsResult.rows;

      // 1c. Infer Sale Type based on Relationships
      // Check if it's Type 03 (Consumption)
      const consumptionResult = await query(
          `SELECT package_id, quantity FROM package_consumptions WHERE sale_id = $1`,
          [saleId]
      );
      const isType03 = consumptionResult.rowCount > 0;

      // Check if it's Type 02 (Genesis - Created Package)
      // We check this later for deletion, but for now we need to know if we should reverse credit addition
      // We assume if it has items with service_id AND it created a package, it was a Type 02.
      // But simpler: just check if packages exist with this sale_id
      const genesisPackageResult = await query(
        "SELECT id, consumed_quantity FROM client_packages WHERE sale_id = $1",
        [saleId]
      );
      const isType02 = genesisPackageResult.rowCount > 0;


      // 2. Handle Unified Wallet Reversal
      // A carteira e unificada por cliente+servico. A venda "genese" cria a linha
      // em client_packages e as RECARGAS Tipo 02 seguintes apenas acumulam nela.
      // Por isso a reversao NAO pode depender de genesisPackageResult (que so
      // enxerga a genese) -- precisa reverter os creditos de qualquer venda Tipo 02,
      // inclusive recarga, para o saldo (available) nao ficar inflado.
      const type02Items = items.filter(
        (item) => String(item.sale_type) === "02",
      );

      if (type02Items.length > 0) {
          console.log("Tipo 02 detectado - revertendo creditos da carteira");

          const carrierId = saleData.client_id;
          const totalCredits = type02Items.reduce(
            (acc, item) => acc + Number(item.quantity || 0),
            0,
          );

          if (totalCredits > 0) {
              // Carteira unificada por cliente. Como sale_items nao tem service_id,
              // revertemos os creditos nas carteiras do cliente (ativas primeiro,
              // mais recentes primeiro), respeitando o piso 0 (sem saldo negativo)
              // e mantendo a invariante available = initial - consumed.
              const walletRes = await query(
                  `SELECT id, initial_quantity, consumed_quantity, available_quantity, unit_price
                   FROM client_packages
                   WHERE client_id = $1
                   ORDER BY is_active DESC, created_at DESC`,
                  [carrierId],
              );

              let remaining = totalCredits;
              for (const wallet of walletRes.rows) {
                  if (remaining <= 0) break;

                  const available = Number(wallet.available_quantity) || 0;
                  const consumed = Number(wallet.consumed_quantity) || 0;
                  const initial = Number(wallet.initial_quantity) || 0;
                  const unitPrice = Number(wallet.unit_price) || 0;

                  // So da para remover ate o que ainda esta disponivel
                  const removed = Math.min(remaining, available);
                  if (removed <= 0) continue;

                  const newAvailable = available - removed;
                  const newInitial = initial - removed;
                  remaining -= removed;

                  if (newInitial <= 0 && consumed <= 0) {
                      // Carteira zerada e sem consumo: pode remover a linha inteira
                      console.log(`Carteira ${wallet.id} zerada sem consumo. Removendo.`);
                      await query(`DELETE FROM client_packages WHERE id = $1`, [
                          wallet.id,
                      ]);
                  } else {
                      const newTotalPaid = Math.max(
                          0.01,
                          Math.round(newInitial * unitPrice * 100) / 100,
                      );
                      await query(
                          `UPDATE client_packages
                           SET available_quantity = $1,
                               initial_quantity = $2,
                               total_paid = $3,
                               updated_at = NOW()
                           WHERE id = $4`,
                          [newAvailable, newInitial, newTotalPaid, wallet.id],
                      );
                  }
              }

              if (remaining > 0) {
                  console.log(
                      `Aviso: ${remaining} creditos da venda ${saleId} nao puderam ser revertidos (ja consumidos).`,
                  );
              }
          }
      } 
      
      if (isType03) {
          // TYPE 03: Package Consumption logic infered
          console.log("Infered Type 03 (Consumption) - Refunding Wallet");

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

          // Delete Consumption Records
          await query("DELETE FROM package_consumptions WHERE sale_id = $1", [saleId]);
      } else {
         // Orphan check for hygiene
         await query("DELETE FROM package_consumptions WHERE sale_id = $1", [saleId]);
      }

      // 2.5 Handle Genesis Package Deletion (If this sale CREATED a wallet)
      // We no longer block deletion if used. We just decouple the sale.
      if (genesisPackageResult.rowCount > 0) {
          for (const pkg of genesisPackageResult.rows) {
              if (Number(pkg.consumed_quantity || 0) > 0) {
                  // Package has usage, just break the link to allow sale deletion
                  console.log(`Package ${pkg.id} has usage. NULLing sale_id instead of deleting.`);
                  await query(
                      "UPDATE client_packages SET sale_id = NULL WHERE id = $1",
                      [pkg.id]
                  );
              } else {
                  // No usage, we can safely delete the package entirely
                  console.log(`Package ${pkg.id} is empty. Deleting entirely.`);
                  await query("DELETE FROM client_packages WHERE id = $1", [pkg.id]);
              }
          }
      }

      // 3. Delete Dependencies (Speculative Cleanup for hidden constraints)
      const potentialTables = ['financial_transactions', 'notifications', 'invoices', 'logs'];
      const dependentTables = await query(
        `SELECT table_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND column_name = 'sale_id'
           AND table_name = ANY($1::text[])`,
        [potentialTables],
      );
      for (const row of dependentTables.rows) {
          const table = String(row.table_name);
          await query(`DELETE FROM "${table}" WHERE sale_id = $1`, [saleId]);
      }

      await query("DELETE FROM commissions WHERE sale_id = $1", [saleId]);

      const refundsTable = await query(
        `SELECT to_regclass('public.sale_refunds') AS table_name`,
      );
      if (refundsTable.rows[0]?.table_name) {
        await query("DELETE FROM sale_refunds WHERE sale_id = $1", [saleId]);
      }
      
      await query("DELETE FROM sale_items WHERE sale_id = $1", [saleId]);

      // 4. Delete Sale
      await query("DELETE FROM sales WHERE id = $1", [saleId]);

      await query("COMMIT");

      return NextResponse.json(
        { message: "Venda excluida permanentemente" },
        { status: 200 }
      );
    } catch (error) {
      await query("ROLLBACK");
      const dbError = error as DbError;
      console.error("DELETE TRANSACTION ERROR:", {
          message: dbError.message,
          code: dbError.code,
          detail: dbError.detail,
          constraint: dbError.constraint,
          stack: dbError.stack
      });

      // Construct a detailed error message for the frontend
      const message = dbError.message || "Erro ao excluir venda";
      const details = [
          dbError.detail,
          dbError.constraint ? `Constraint: ${dbError.constraint}` : null,
          dbError.table ? `Table: ${dbError.table}` : null
      ].filter(Boolean).join(" | ");

      const status = message.includes("autenticacao") ? 401 : 500;
      
      return NextResponse.json({ 
          error: message, 
          details: details || undefined 
      }, { status });
    }
}
