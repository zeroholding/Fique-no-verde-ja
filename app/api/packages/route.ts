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
 * GET /api/packages
 *
 * Retorna os pacotes ativos com saldo disponível
 *
 * Query params opcionais:
 * - clientId: Filtrar por cliente específico
 * - serviceId: Filtrar por serviço específico
 */
export async function GET(request: NextRequest) {
  try {
    // Autenticar usuário
    const user = await authenticateUser(request);

    // Extrair query params
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const serviceId = searchParams.get("serviceId");

    // Construir query dinâmica
    let sql = `
      SELECT
        cp.id,
        cp.client_id,
        c.name as client_name,
        cp.service_id,
        s.name as service_name,
        cp.initial_quantity,
        cp.consumed_quantity,
        cp.available_quantity,
        cp.unit_price,
        cp.total_paid,
        cp.expires_at,
        cp.created_at,
        CASE
          WHEN cp.expires_at IS NOT NULL AND cp.expires_at < CURRENT_DATE THEN true
          ELSE false
        END as is_expired
      FROM client_packages cp
      JOIN clients c ON cp.client_id = c.id
      JOIN services s ON cp.service_id = s.id
      WHERE cp.is_active = true
        AND cp.available_quantity > 0
        AND (cp.expires_at IS NULL OR cp.expires_at >= CURRENT_DATE)
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Filtrar por cliente se fornecido
    if (clientId) {
      sql += ` AND cp.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }

    // Filtrar por serviço se fornecido
    if (serviceId) {
      sql += ` AND cp.service_id = $${paramIndex}`;
      params.push(serviceId);
      paramIndex++;
    }

    sql += ` ORDER BY cp.created_at DESC`;

    // Executar query
    console.log("[PACKAGES API] SQL:", sql);
    console.log("[PACKAGES API] Params:", params);

    const result = await query(sql, params);

    console.log("[PACKAGES API] Found packages:", result.rows.length);

    return NextResponse.json(
      {
        packages: result.rows.map((row: any) => ({
          id: row.id,
          clientId: row.client_id,
          clientName: row.client_name,
          serviceId: row.service_id,
          serviceName: row.service_name,
          initialQuantity: row.initial_quantity,
          consumedQuantity: row.consumed_quantity,
          availableQuantity: row.available_quantity,
          unitPrice: parseFloat(row.unit_price),
          totalPaid: parseFloat(row.total_paid),
          expiresAt: row.expires_at,
          createdAt: row.created_at,
          isExpired: row.is_expired,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao buscar pacotes:", error);

    const message =
      error instanceof Error ? error.message : "Erro ao buscar pacotes";

    return NextResponse.json(
      { error: message },
      { status: error instanceof Error && error.message.includes("autenticação") ? 401 : 500 }
    );
  }
}
