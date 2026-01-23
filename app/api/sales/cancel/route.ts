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

// POST - Cancelar venda
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
      // Verificar se a venda existe
      const saleCheck = await query(
        `SELECT id, client_id, attendant_id, status FROM sales WHERE id = $1`,
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

      if (sale.status === "cancelada") {
        await query("ROLLBACK");
        return NextResponse.json(
          { error: "Esta venda ja foi cancelada" },
          { status: 400 }
        );
      }

      // Verificar permissões
      if (!user.is_admin && sale.attendant_id !== user.id) {
        await query("ROLLBACK");
        return NextResponse.json(
          { error: "Voce nao tem permissao para cancelar esta venda" },
          { status: 403 }
        );
      }

      // Atualizar status da venda para cancelada
      await query(
        `UPDATE sales
         SET status = 'cancelada', cancelled_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [saleId]
      );

      // Cancelar comissões pendentes relacionadas à venda
      await query(
        `UPDATE commissions
         SET status = 'cancelado'
         WHERE sale_id = $1 AND status = 'a_pagar'`,
        [saleId]
      );

      // --- LOGICA DE ESTORNO ---
      
      // 1. Verificar Consumos (Type 03)
      const consumptionResult = await query(
          `SELECT package_id, quantity FROM package_consumptions WHERE sale_id = $1`,
          [saleId]
      );
      
      if (consumptionResult.rowCount > 0) {
          console.log(`[CANCEL] Reverting Consumption (Type 03) for Sale ${saleId}`);
          for (const cons of consumptionResult.rows) {
              await query(
                  `UPDATE client_packages
                   SET available_quantity = available_quantity + $1,
                       consumed_quantity = consumed_quantity - $1,
                       updated_at = NOW()
                   WHERE id = $2`,
                  [cons.quantity, cons.package_id]
              );
          }
      }

      // 2. Verificar Criação de Pacote (Type 02 - Recarga)
      const genesisResult = await query(
          "SELECT id, initial_quantity FROM client_packages WHERE sale_id = $1", 
          [saleId]
      );

      if (genesisResult.rowCount > 0) {
          console.log(`[CANCEL] Reverting Package Purchase (Type 02) for Sale ${saleId}`);
          // Se a venda criou pacotes, o cancelamento deve anular esses pacotes.
          for (const pkg of genesisResult.rows) {
              // Reduzimos o available pelo que foi inicializado e marcamos como inativo
              // Se já foi consumido, o saldo ficará negativo, o que é permitido/esperado
              // para indicar que deve ser pago novamente.
              await query(
                  `UPDATE client_packages 
                   SET available_quantity = available_quantity - initial_quantity,
                       initial_quantity = 0,
                       is_active = false,
                       updated_at = NOW()
                   WHERE id = $1`,
                  [pkg.id]
              );
          }
      }

      await query("COMMIT");

      return NextResponse.json(
        { message: "Venda cancelada com sucesso" },
        { status: 200 }
      );
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Erro ao cancelar venda:", error);
    const message = error instanceof Error ? error.message : "Erro ao cancelar venda";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
