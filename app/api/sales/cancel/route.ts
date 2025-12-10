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
        `SELECT id, attendant_id, status FROM sales WHERE id = $1`,
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

      // Estornar consumos de pacote se houver
      try {
        await query("SELECT refund_package_consumption($1)", [saleId]);
        console.log(`Consumos de pacote estornados para venda ${saleId}`);
      } catch (refundError) {
        console.log("Nenhum consumo de pacote para estornar ou erro:", refundError);
        // Não falhar se não houver consumo de pacote (pode ser venda comum)
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
