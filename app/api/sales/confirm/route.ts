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

// POST - Confirmar venda
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateUser(request);
    const { saleId } = await request.json();

    if (!saleId) {
      return NextResponse.json(
        { error: "ID da venda e obrigatorio" },
        { status: 400 }
      );
    }

    await query("BEGIN");

    try {
      // Verificar se a venda existe e está aberta
      const saleCheck = await query(
        `SELECT id, attendant_id, status, sale_date FROM sales WHERE id = $1`,
        [saleId]
      );

      if (saleCheck.rowCount === 0) {
        await query("ROLLBACK");
        return NextResponse.json(
          { error: "Venda nao encontrada" },
          { status: 404 }
        );
      }

      const sale = saleCheck.rows[0];

      if (sale.status !== "aberta") {
        await query("ROLLBACK");
        return NextResponse.json(
          { error: "Apenas vendas abertas podem ser confirmadas" },
          { status: 400 }
        );
      }

      // Verificar permissões
      if (!user.is_admin && sale.attendant_id !== user.id) {
        await query("ROLLBACK");
        return NextResponse.json(
          { error: "Voce nao tem permissao para confirmar esta venda" },
          { status: 403 }
        );
      }

      // Atualizar status da venda para confirmada
      await query(
        `UPDATE sales
         SET status = 'confirmada', confirmed_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [saleId]
      );

      // Buscar itens da venda para gerar comissões (agora incluindo product_id)
      const itemsResult = await query(
        `SELECT id, total, quantity, sale_type, product_id FROM sale_items WHERE sale_id = $1`,
        [saleId]
      );

      // Não precisamos mais buscar todas as políticas na memória. Vamos perguntar ao Banco qual a certa.

      for (const item of itemsResult.rows) {
        const itemSaleType = item.sale_type || "01";
        const itemTotal = parseFloat(item.total);
        const itemQuantity = parseInt(item.quantity || 1);

        // GARANTIA: Venda de Pacote (02) nunca gera comissão na confirmação
        if (itemSaleType === "02") {
            console.log(`[CONFIRM SALE] Skipping commission for item ${item.id} (Type 02 - Package Sale)`);
            continue;
        }

        let policy = null;
        let commissionAmount = 0;
        let commissionType = 'percentage';
        let commissionRate = 5.00; // Default fallback

        // 1. Perguntar ao banco qual a política certa para este item/atendente/data
        try {
            const policyIdResult = await query(
            `SELECT get_applicable_commission_policy($1, $2, $3::DATE, $4) as policy_id`,
            [sale.attendant_id, item.product_id || null, sale.sale_date, itemSaleType]
            );

            if (policyIdResult.rows.length > 0 && policyIdResult.rows[0].policy_id) {
                const policyId = policyIdResult.rows[0].policy_id;
                // 2. Buscar detalhes da política encontrada
                const policyDetails = await query(
                `SELECT * FROM commission_policies WHERE id = $1`,
                [policyId]
                );
                if (policyDetails.rows.length > 0) {
                policy = policyDetails.rows[0];
                console.log(`[CONFIRM SALE] Política encontrada via DB Function: ${policy.name} (ID: ${policy.id})`);
                }
            }
        } catch (err) {
            console.error("[CONFIRM SALE] Erro ao buscar política via DB:", err);
        }

        // 3. Se achou política, calcula baseado nela. Se não, usa fallback.
        if (policy) {
            if (policy.type === 'fixed_per_unit') {
                commissionRate = parseFloat(policy.value);
                commissionAmount = commissionRate * itemQuantity;
                commissionType = 'fixed_per_unit';
            } else {
                // Percentage
                commissionRate = parseFloat(policy.value);
                commissionAmount = itemTotal * (commissionRate / 100);
                commissionType = 'percentage';
            }
        } else {
            // Fallback 5% (Mantendo a lógica "boazinha" se não achar nada)
            console.log(`[CONFIRM SALE] Nenhuma política encontrada para item ${item.id}. Usando Fallback 5%.`);
            commissionRate = 5.00;
            commissionAmount = itemTotal * (commissionRate / 100);
            commissionType = 'percentage';
        }

        console.log(`[CONFIRM SALE] Commission for item ${item.id.slice(0, 8)}: ${commissionAmount} (type: ${commissionType}, rate: ${commissionRate})`);

        await query(
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
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::DATE, 'a_pagar', $9)`,
            [
            saleId,
            item.id,
            sale.attendant_id,
            itemTotal,
            commissionType,
            commissionRate,
            commissionAmount,
            sale.sale_date,
            policy ? policy.id : null,
            ]
        );
      }

      await query("COMMIT");

      return NextResponse.json(
        { message: "Venda confirmada com sucesso" },
        { status: 200 }
      );
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Erro ao confirmar venda:", error);
    const message = error instanceof Error ? error.message : "Erro ao confirmar venda";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
