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

      // Buscar itens da venda para gerar comissões
      const itemsResult = await query(
        `SELECT id, total, quantity, sale_type FROM sale_items WHERE sale_id = $1`,
        [saleId]
      );

      // Buscar políticas de comissão ativas
      const policiesResult = await query(
        `SELECT * FROM commission_policies
         WHERE is_active = true
         AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
         AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)`,
        []
      );

      const policies = policiesResult.rows;

      for (const item of itemsResult.rows) {
        const itemSaleType = item.sale_type || "01";
        const itemTotal = parseFloat(item.total);
        const itemQuantity = parseInt(item.quantity || 1);

        // Buscar política aplicável para o sale_type do item
        let policy = policies.find((p: any) => p.sale_type === itemSaleType && p.scope === 'general');

        // Se não encontrar política específica, usar a política geral
        if (!policy) {
          policy = policies.find((p: any) => (p.sale_type === 'all' || !p.sale_type) && p.scope === 'general');
        }

        if (!policy) {
          console.warn(`[CONFIRM SALE] Nenhuma política encontrada para sale_type: ${itemSaleType}`);
          continue;
        }

        let commissionAmount = 0;
        let commissionType = 'percentage';
        let commissionRate = 0;

        // Calcular comissão baseado no tipo da política
        if (policy.type === 'fixed_per_unit') {
          commissionAmount = parseFloat(policy.value) * itemQuantity;
          commissionType = 'fixed_per_unit';
          commissionRate = parseFloat(policy.value);
        } else if (policy.type === 'percentage') {
          commissionRate = parseFloat(policy.value);
          commissionAmount = itemTotal * (commissionRate / 100);
          commissionType = 'percentage';
        } else {
          // Tipo padrão (porcentagem)
          commissionRate = 5.00;
          commissionAmount = itemTotal * (commissionRate / 100);
        }

        console.log(`[CONFIRM SALE] Commission for item ${item.id.slice(0, 8)}: ${commissionAmount} (type: ${commissionType}, rate: ${commissionRate}, sale_type: ${itemSaleType})`);

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
            policy.id,
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
