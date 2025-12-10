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

/**
 * GET /api/packages/[id]/consumptions
 *
 * Retorna o histórico de consumos de um pacote específico
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    // Autenticar usuário
    const user = await authenticateUser(request);

    const packageId = params.id;

    // Buscar consumos do pacote
    const result = await query(
      `
      SELECT
        pc.id,
        pc.package_id,
        pc.sale_id,
        pc.quantity,
        pc.unit_price,
        pc.total_value,
        pc.consumed_at,
        s.sale_date,
        s.status as sale_status,
        u.first_name || ' ' || u.last_name as attendant_name
      FROM package_consumptions pc
      JOIN sales s ON pc.sale_id = s.id
      JOIN users u ON s.attendant_id = u.id
      WHERE pc.package_id = $1
      ORDER BY pc.consumed_at DESC
      `,
      [packageId]
    );

    return NextResponse.json(
      {
        consumptions: result.rows.map((row: any) => ({
          id: row.id,
          packageId: row.package_id,
          saleId: row.sale_id,
          quantity: row.quantity,
          unitPrice: parseFloat(row.unit_price),
          totalValue: parseFloat(row.total_value),
          consumedAt: row.consumed_at,
          saleDate: row.sale_date,
          saleStatus: row.sale_status,
          attendantName: row.attendant_name,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao buscar consumos do pacote:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Erro ao buscar consumos do pacote";

    return NextResponse.json(
      { error: message },
      {
        status:
          error instanceof Error && error.message.includes("autenticação")
            ? 401
            : 500,
      }
    );
  }
}
