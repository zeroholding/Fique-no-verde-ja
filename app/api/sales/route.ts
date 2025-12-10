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



// GET - Listar vendas

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const attendantId = searchParams.get("attendantId");
    const user = await authenticateUser(request);
    // Escopo: atendente vÃƒÆ’Ã‚Âª apenas suas vendas; admin vÃƒÆ’Ã‚Âª todas ou filtra por atendente se fornecido
    let whereClause = "";
    const queryParams: any[] = [];
    if (user.is_admin && attendantId) {
      whereClause = "WHERE s.attendant_id = $1";
      queryParams.push(attendantId);
    } else if (!user.is_admin) {
      whereClause = "WHERE s.attendant_id = $1";
      queryParams.push(user.id);
    }


    let hasRefundSupport = true;
    let sales;
    try {
      sales = await query(
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
          s.commission_amount,
          c.name as client_name,
          c.client_type,
          u.first_name || ' ' || u.last_name as attendant_name
         FROM sales s
         JOIN clients c ON s.client_id = c.id
         JOIN users u ON s.attendant_id = u.id
         ${whereClause}
         ORDER BY s.sale_date DESC`,
        queryParams
      );
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("refund_total") || msg.includes("sale_refunds")) {
        hasRefundSupport = false;
        sales = await query(
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
            s.commission_amount,
            c.name as client_name,
            c.client_type,
            u.first_name || ' ' || u.last_name as attendant_name
           FROM sales s
           JOIN clients c ON s.client_id = c.id
           JOIN users u ON s.attendant_id = u.id
           ${whereClause}
           ORDER BY s.sale_date DESC`,
          queryParams
        );
      } else {
        throw err;
      }
    }


    // Buscar os itens de cada venda

    const formattedSales = await Promise.all(

      sales.rows.map(async (sale: any) => {

        const items = await query(
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
            sale_type

           FROM sale_items

           WHERE sale_id = $1

           ORDER BY created_at`,
          [sale.id]
        );

        let refunds: any[] = [];
        if (hasRefundSupport) {
          try {
            const refundsResult = await query(
              `SELECT
                id,
                amount,
                reason,
                created_by,
                created_at
               FROM sale_refunds
               WHERE sale_id = $1
               ORDER BY created_at DESC`,
              [sale.id]
            );
            refunds = refundsResult.rows;
          } catch (err: any) {
            const msg = err?.message || "";
            if (msg.includes("sale_refunds")) {
              hasRefundSupport = false;
              refunds = [];
            } else {
              throw err;
            }
          }
        }

        return {
          id: sale.id,
          clientId: sale.client_id,
          clientName: sale.client_name,
          clientType: sale.client_type,
          attendantId: sale.attendant_id,

          attendantName: sale.attendant_name,

          saleDate: sale.sale_date,

          observations: sale.observations,

          status: sale.status,
          
          saleType: items.rows.length > 0 ? items.rows[0].sale_type : "01",

          paymentMethod: sale.payment_method,

          generalDiscountType: sale.general_discount_type,

          generalDiscountValue: sale.general_discount_value,

          subtotal: parseFloat(sale.subtotal),

          totalDiscount: parseFloat(sale.total_discount),

          total: parseFloat(sale.total),
          refundTotal: hasRefundSupport ? parseFloat(sale.refund_total || 0) : 0,
          commissionAmount: parseFloat(sale.commission_amount || 0),
          confirmedAt: sale.confirmed_at,
          cancelledAt: sale.cancelled_at,
          createdAt: sale.created_at,
          updatedAt: sale.updated_at,
          items: items.rows.map((item: any) => ({

            id: item.id,

            productId: item.product_id,

            productName: item.product_name,

            quantity: item.quantity,

            unitPrice: parseFloat(item.unit_price),

            discountType: item.discount_type,

            discountValue: parseFloat(item.discount_value),
            subtotal: parseFloat(item.subtotal),
            discountAmount: parseFloat(item.discount_amount),
            total: parseFloat(item.total),
            saleType: item.sale_type,
          })),
          refunds: hasRefundSupport
            ? refunds.map((ref: any) => ({
                id: ref.id,
                amount: parseFloat(ref.amount),
                reason: ref.reason,
                createdBy: ref.created_by,
                createdAt: ref.created_at,
              }))
            : [],
        };
      })
    );


    return NextResponse.json({ sales: formattedSales }, { status: 200 });

  } catch (error) {

    const message =

      error instanceof Error

        ? error.message

        : "Nao foi possivel carregar as vendas";

    const status = message.includes("autenticacao") ? 401 : 500;

    return NextResponse.json({ error: message }, { status });

  }

}



// POST - Criar nova venda

export async function POST(request: NextRequest) {

  try {

    const user = await authenticateUser(request);

    const body = await request.json();

    const {
      clientId,
      observations,
      paymentMethod,
      items,
      generalDiscountType,
      generalDiscountValue,
      saleType, // "01", "02", ou "03"
      serviceId, // Usado para tipo "02" (Venda de Pacote)
      packageId, // Usado para tipo "03" (Consumo de Pacote)
      carrierId, // Transportadora (dona do pacote) para tipo "02" e "03"
    } = body;

    const normalizedSaleType: "01" | "02" | "03" = saleType || "01";

    console.log("[SALES POST] Request body:", {
      saleType: normalizedSaleType,
      clientId,
      carrierId,
      packageId,
      serviceId,
    });

    // ValidaÃƒÆ'Ã‚Â§ÃƒÆ'Ã‚Âµes
    if (normalizedSaleType === "01" && !clientId) {
      return NextResponse.json(
        { error: "Cliente e obrigatorio" },
        { status: 400 }
      );
    }

    if ((normalizedSaleType === "02" || normalizedSaleType === "03") && !carrierId) {
      return NextResponse.json(
        { error: "Transportadora e obrigatoria para venda/consumo de pacote" },
        { status: 400 }
      );
    }

    if (normalizedSaleType === "03" && !clientId) {
      return NextResponse.json(
        { error: "Cliente final e obrigatorio para consumo de pacote" },
        { status: 400 }
      );
    }

    if (!paymentMethod) {
      return NextResponse.json(
        { error: "Metodo de pagamento e obrigatorio" },
        { status: 400 }
      );
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "A venda deve ter pelo menos um item" },
        { status: 400 }
      );
    }

    // ValidaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o especÃƒÆ’Ã‚Â­fica para consumo de pacote
    if (normalizedSaleType === "03" && !packageId) {
      return NextResponse.json(
        { error: "Package ID obrigatorio para consumo de pacote" },
        { status: 400 }
      );
    }

    const saleClientId =
      normalizedSaleType === "02"
        ? carrierId
        : normalizedSaleType === "03"
          ? clientId
          : clientId;

    // Conferir tipo do cliente para evitar uso indevido
    const clientTypeResult = await query(
      "SELECT client_type FROM clients WHERE id = $1",
      [saleClientId]
    );

    if (clientTypeResult.rowCount === 0) {
      return NextResponse.json(
        { error: "Cliente nao encontrado" },
        { status: 404 }
      );
    }

    const clientType = clientTypeResult.rows[0].client_type || "common";

    console.log("[SALES POST] Client validation:", {
      saleClientId,
      clientType,
      normalizedSaleType,
    });

    if (normalizedSaleType === "01" && clientType === "package") {
      return NextResponse.json(
        { error: "Clientes de pacote nao podem realizar venda comum" },
        { status: 400 }
      );
    }

    // Para vendas tipo 02 e 03, saleClientId já é o carrierId (tipo 02) ou verificamos se o cliente final existe
    if (normalizedSaleType === "02") {
      // Para tipo 02, o saleClientId é o carrierId, já validado acima
      if (clientType !== "package") {
        return NextResponse.json(
          { error: "Apenas clientes de pacote (transportadora) podem comprar pacotes" },
          { status: 400 }
        );
      }
    }

    if (normalizedSaleType === "03") {
      // Para tipo 03, precisamos validar tanto o cliente final quanto a transportadora
      // O saleClientId é o clientId (cliente final), já validado acima

      // Validar se o carrierId foi enviado
      if (!carrierId) {
        console.error("[SALES POST] CarrierId is missing for type 03");
        return NextResponse.json(
          { error: "Transportadora e obrigatoria para consumo de pacote" },
          { status: 400 }
        );
      }

      // Validar a transportadora separadamente
      console.log("[SALES POST] Validating carrier for type 03:", { carrierId, type: typeof carrierId });

      const carrierTypeResult = await query(
        "SELECT id, name, client_type FROM clients WHERE id = $1",
        [carrierId]
      );

      console.log("[SALES POST] Carrier query result:", {
        rowCount: carrierTypeResult.rowCount,
        rows: carrierTypeResult.rows,
      });

      if (carrierTypeResult.rowCount === 0) {
        return NextResponse.json(
          { error: `Transportadora nao encontrada (ID: ${carrierId})` },
          { status: 404 }
        );
      }

      const carrierType = carrierTypeResult.rows[0].client_type || "common";
      if (carrierType !== "package") {
        return NextResponse.json(
          { error: `Cliente ${carrierTypeResult.rows[0].name} nao e uma transportadora (tipo: ${carrierType})` },
          { status: 400 }
        );
      }

      console.log("[SALES POST] Carrier validated:", carrierTypeResult.rows[0].name);
    }


    // Iniciar transaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o

    await query("BEGIN");



    try {

      // Criar a venda

      const saleResult = await query(
        `INSERT INTO sales (
          client_id,
          attendant_id,
          sale_date,
          observations,
          payment_method,
          general_discount_type,
          general_discount_value,
          status,
          confirmed_at
        ) VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5, $6, 'confirmada', CURRENT_TIMESTAMP)
        RETURNING id, sale_date`,
        [
          saleClientId,
          user.id,
          observations || null,
          paymentMethod,
          generalDiscountType || null,
          generalDiscountValue || 0,
        ]
      );


      const saleId = saleResult.rows[0].id;

      const saleDate = saleResult.rows[0].sale_date;



      let totalSubtotal = 0;

      let totalDiscountAmount = 0;



      // Inserir os itens da venda

      for (const item of items) {

        const {
          productId,
          productName,
          quantity,
          unitPrice,
          calculatedSubtotal,
          discountType,
          discountValue,
        } = item;

        const normalizedProductId = productId || null;

        console.log("DEBUG BACKEND - Item recebido:", {
          saleType: normalizedSaleType,
          productName,
          quantity,
          unitPrice,
          calculatedSubtotal,
        });


        // Usar calculatedSubtotal se disponÃƒÆ’Ã‚Â­vel (para serviÃƒÆ’Ã‚Â§os com cÃƒÆ’Ã‚Â¡lculo progressivo)

        // Caso contrÃƒÆ’Ã‚Â¡rio, calcular normalmente

        const subtotal = calculatedSubtotal !== undefined && calculatedSubtotal !== null

          ? Number(calculatedSubtotal)

          : quantity * unitPrice;



        console.log("DEBUG BACKEND - Subtotal usado:", subtotal);



        let discountAmount = 0;



        if (discountType === "percentage" && discountValue > 0) {

          discountAmount = subtotal * (discountValue / 100);

        } else if (discountType === "fixed" && discountValue > 0) {

          discountAmount = discountValue;

        }



        const itemTotal = subtotal - discountAmount;



        await query(

          `INSERT INTO sale_items (
            sale_id,
            product_id,
            product_name,
            quantity,
            unit_price,

            discount_type,

            discount_value,

            subtotal,

            discount_amount,

            total,

            sale_type

          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            saleId,
            normalizedProductId,
            productName,
            quantity,
            unitPrice,
            discountType || null,

            discountValue || 0,

            subtotal,

            discountAmount,

            itemTotal,

            normalizedSaleType

          ]

        );



        totalSubtotal += subtotal;

        totalDiscountAmount += discountAmount;

      }



      // Aplicar desconto geral se houver

      let generalDiscountAmount = 0;

      if (generalDiscountType === "percentage" && generalDiscountValue > 0) {

        generalDiscountAmount = totalSubtotal * (generalDiscountValue / 100);

      } else if (generalDiscountType === "fixed" && generalDiscountValue > 0) {

        generalDiscountAmount = generalDiscountValue;

      }



      const finalTotal = totalSubtotal - totalDiscountAmount - generalDiscountAmount;

      const totalDiscountGiven = totalDiscountAmount + generalDiscountAmount;

      const netAmount = finalTotal; // Valor lÃƒÆ’Ã‚Â­quido (apÃƒÆ’Ã‚Â³s descontos)



      // ============================================

      // CÃƒÆ’Ã‚ÂLCULO DE COMISSÃƒÆ’Ã†â€™O

      // ============================================

      let commissionAmount = 0;
      let commissionPolicyId = null;
      const defaultCommissionRate = 5; // % fallback quando nenhuma politica for encontrada

      if (normalizedSaleType !== "02") {
        // Buscar politica de comissao aplicavel
        const firstItem = items[0];
        const firstItemProductId = firstItem?.productId || null;
        const policyResult = await query(
          `SELECT get_applicable_commission_policy($1, $2, $3::DATE, $4) as policy_id`,
          [user.id, firstItemProductId, saleDate, normalizedSaleType]
        );

        if (policyResult.rows.length > 0 && policyResult.rows[0].policy_id) {
          commissionPolicyId = policyResult.rows[0].policy_id;

          const commissionResult = await query(
            `SELECT calculate_commission($1, $2, $3) as commission`,
            [saleId, netAmount, commissionPolicyId]
          );

          if (commissionResult.rows.length > 0) {
            commissionAmount = parseFloat(commissionResult.rows[0].commission || 0);
          }
        } else {
          // Fallback: aplica taxa padrao sobre o valor liquido quando nao ha politica
          commissionAmount = parseFloat(((netAmount * defaultCommissionRate) / 100).toFixed(2));
        }
      }

      console.log("DEBUG - Comissao calculada:", {
        netAmount,
        commissionPolicyId,
        commissionAmount,
      });

      // Atualizar totais da venda (incluindo comissÃƒÆ’Ã‚Â£o e desconto)

      await query(

        `UPDATE sales

         SET subtotal = $1,

             total_discount = $2,

             total = $3,

             discount_amount = $4,

             commission_amount = $5,

             commission_policy_id = $6

         WHERE id = $7`,

        [

          totalSubtotal,

          totalDiscountGiven,

          finalTotal,

          totalDiscountGiven,

          commissionAmount,

          commissionPolicyId,

          saleId

        ]

      );



      // ============================================

      // LÃƒÆ’Ã¢â‚¬Å“GICA ESPECÃƒÆ’Ã‚ÂFICA POR TIPO DE VENDA

      // ============================================



      if (normalizedSaleType === "02" && serviceId) {
        // Tipo 02 - VENDA DE PACOTE: Criar pacote para o cliente
        const firstItem = items[0];
        const totalQuantity = firstItem.quantity;
        const totalPaid = finalTotal;
        const unitPricePackage = totalPaid / totalQuantity;

        await query(
          `INSERT INTO client_packages (
            client_id,
            service_id,
            sale_id,

            initial_quantity,

            consumed_quantity,

            available_quantity,

            unit_price,

            total_paid,

            is_active

          ) VALUES ($1, $2, $3, $4, 0, $4, $5, $6, true)`,
          [carrierId, serviceId, saleId, totalQuantity, unitPricePackage, totalPaid]
        );

        console.log(`Pacote criado: ${totalQuantity} creditos para cliente ${carrierId}`);
      } else if (normalizedSaleType === "03" && packageId) {
        // Tipo 03 - CONSUMO DE PACOTE: Consumir do pacote existente
        const firstItem = items[0];
        const quantityToConsume = firstItem.quantity;

        const packageCheck = await query(
          `SELECT client_id, available_quantity FROM client_packages WHERE id = $1`,
          [packageId]
        );

        if (packageCheck.rowCount === 0) {
          throw new Error("Pacote nao encontrado");
        }

        const pkgRow = packageCheck.rows[0];
        if (carrierId && pkgRow.client_id !== carrierId) {
          throw new Error("Pacote nao pertence ÃƒÆ’Ã‚Â  transportadora selecionada");
        }

        if (pkgRow.available_quantity < quantityToConsume) {
          throw new Error("Saldo insuficiente no pacote selecionado");
        }


        // Usar a funÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o consume_package para garantir atomicidade

        try {

          await query("SELECT consume_package($1, $2, $3)", [

            packageId,

            saleId,

            quantityToConsume,

          ]);



          console.log(

            `Consumido ${quantityToConsume} unidades do pacote ${packageId}`

          );

        } catch (pkgError: any) {

          // Se falhar, reverter tudo

          throw new Error(

            `Erro ao consumir pacote: ${pkgError.message || "Saldo insuficiente ou pacote invÃƒÆ’Ã‚Â¡lido"}`

          );

        }

      }



      await query("COMMIT");



      return NextResponse.json(
        {
          sale: {
            id: saleId,
            saleDate,
            status: "confirmada",
            total: finalTotal,
            refundTotal: 0,
            saleType: normalizedSaleType,
          },
          message: "Venda criada com sucesso",
        },
        { status: 201 }
      );
    } catch (error) {

      await query("ROLLBACK");

      throw error;

    }

  } catch (error) {

    console.error("Erro ao criar venda:", error);

    const message = error instanceof Error ? error.message : "Erro ao criar venda";

    const status = message.includes("autenticacao") ? 401 : 400;

    return NextResponse.json({ error: message }, { status });

  }

}



// PUT - Atualizar venda (apenas vendas abertas)

export async function PUT(request: NextRequest) {

  try {

    const user = await authenticateUser(request);

    const body = await request.json();

    const {

      id,

      clientId,

      observations,

      paymentMethod,

      items,

      generalDiscountType,

      generalDiscountValue,

    } = body;



    if (!id) {

      return NextResponse.json(

        { error: "ID da venda e obrigatorio" },

        { status: 400 }

      );

    }



    // Verificar se a venda existe e estÃƒÆ’Ã‚Â¡ aberta

    const saleCheck = await query(

      `SELECT id, attendant_id, status FROM sales WHERE id = $1`,

      [id]

    );



    if (saleCheck.rowCount === 0) {

      return NextResponse.json(

        { error: "Venda nao encontrada" },

        { status: 404 }

      );

    }



    const sale = saleCheck.rows[0];



    if (sale.status !== "aberta") {

      return NextResponse.json(

        { error: "Apenas vendas abertas podem ser editadas" },

        { status: 400 }

      );

    }



    // Verificar permissÃƒÆ’Ã‚Âµes: apenas o prÃƒÆ’Ã‚Â³prio atendente ou admin pode editar

    if (!user.is_admin && sale.attendant_id !== user.id) {

      return NextResponse.json(

        { error: "Voce nao tem permissao para editar esta venda" },

        { status: 403 }

      );

    }



    await query("BEGIN");



    try {

      // Atualizar a venda

      await query(

        `UPDATE sales

         SET client_id = $1,

             observations = $2,

             payment_method = $3,

             general_discount_type = $4,

             general_discount_value = $5

         WHERE id = $6`,

        [

          clientId,

          observations || null,

          paymentMethod,

          generalDiscountType || null,

          generalDiscountValue || 0,

          id,

        ]

      );



      // Remover itens antigos

      await query("DELETE FROM sale_items WHERE sale_id = $1", [id]);



      let totalSubtotal = 0;

      let totalDiscountAmount = 0;



      // Inserir novos itens

      for (const item of items) {

        const {

          productId,

          productName,

          quantity,

          unitPrice,

          calculatedSubtotal,

          discountType,

          discountValue,

          saleType,

        } = item;



        // Usar calculatedSubtotal se disponÃƒÆ’Ã‚Â­vel (para serviÃƒÆ’Ã‚Â§os com cÃƒÆ’Ã‚Â¡lculo progressivo)

        // Caso contrÃƒÆ’Ã‚Â¡rio, calcular normalmente

        const subtotal = calculatedSubtotal !== undefined && calculatedSubtotal !== null

          ? Number(calculatedSubtotal)

          : quantity * unitPrice;



        let discountAmount = 0;



        if (discountType === "percentage" && discountValue > 0) {

          discountAmount = subtotal * (discountValue / 100);

        } else if (discountType === "fixed" && discountValue > 0) {

          discountAmount = discountValue;

        }



        const itemTotal = subtotal - discountAmount;



        await query(

          `INSERT INTO sale_items (

            sale_id,

            product_id,

            product_name,

            quantity,

            unit_price,

            discount_type,

            discount_value,

            subtotal,

            discount_amount,

            total,

            sale_type

          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,

          [

            id,

            productId,

            productName,

            quantity,

            unitPrice,

            discountType || null,

            discountValue || 0,

            subtotal,

            discountAmount,

            itemTotal,

            saleType || "01"

          ]

        );



        totalSubtotal += subtotal;

        totalDiscountAmount += discountAmount;

      }



      // Aplicar desconto geral

      let generalDiscountAmount = 0;

      if (generalDiscountType === "percentage" && generalDiscountValue > 0) {

        generalDiscountAmount = totalSubtotal * (generalDiscountValue / 100);

      } else if (generalDiscountType === "fixed" && generalDiscountValue > 0) {

        generalDiscountAmount = generalDiscountValue;

      }



      const finalTotal = totalSubtotal - totalDiscountAmount - generalDiscountAmount;



      // Atualizar totais

      await query(

        `UPDATE sales

         SET subtotal = $1, total_discount = $2, total = $3

         WHERE id = $4`,

        [totalSubtotal, totalDiscountAmount + generalDiscountAmount, finalTotal, id]

      );



      await query("COMMIT");



      return NextResponse.json(

        {

          message: "Venda atualizada com sucesso",

          total: finalTotal,

        },

        { status: 200 }

      );

    } catch (error) {

      await query("ROLLBACK");

      throw error;

    }

  } catch (error) {

    console.error("Erro ao atualizar venda:", error);

    const message = error instanceof Error ? error.message : "Erro ao atualizar venda";

    const status = message.includes("autenticacao") ? 401 : 400;

    return NextResponse.json({ error: message }, { status });

  }

}










