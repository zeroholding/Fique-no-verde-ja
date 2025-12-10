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

// GET - Listar estornos financeiros (escopo por atendente, exceto admin)
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateUser(request);

    const whereClause = user.is_admin
      ? ""
      : "WHERE s.attendant_id = $1";
    const params = user.is_admin ? [] : [user.id];

    // Fallback se schema nao tiver sale_number ou refund_total / sale_refunds
    let hasRefundSupport = true;
    let refundsResult;
    try {
      refundsResult = await query(
        `SELECT
          sr.id,
          sr.sale_id,
          sr.amount,
          sr.reason,
          sr.created_by,
          sr.created_at,
          s.sale_date,
          s.sale_number,
          s.confirmed_at,
          s.attendant_id,
          c.name AS client_name,
          si.product_name,
          si.quantity,
          u.first_name || ' ' || u.last_name AS created_by_name
        FROM sale_refunds sr
        JOIN sales s ON sr.sale_id = s.id
        LEFT JOIN clients c ON s.client_id = c.id
        LEFT JOIN LATERAL (
          SELECT product_name, quantity
          FROM sale_items
          WHERE sale_id = sr.sale_id
          ORDER BY created_at ASC
          LIMIT 1
        ) si ON true
        LEFT JOIN users u ON sr.created_by = u.id
        ${whereClause}
        ORDER BY sr.created_at DESC`,
        params
      );
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("sale_refunds") || msg.includes("refund_total")) {
        hasRefundSupport = false;
      } else {
        throw err;
      }
    }

    if (!hasRefundSupport) {
      return NextResponse.json(
        {
          error:
            "Funcionalidade de estorno indisponivel: execute a migration 012_add_sale_refunds.sql no banco antes de usar estornos.",
        },
        { status: 400 }
      );
    }

    const refunds = (refundsResult?.rows || []).map((r: any) => ({
      id: r.id,
      saleId: r.sale_id,
      saleNumber: r.sale_number || null,
      saleDate: r.sale_date,
      createdAt: r.created_at,
      amount: parseFloat(r.amount),
      reason: r.reason,
      createdBy: r.created_by,
      createdByName: r.created_by_name || null,
      clientName: r.client_name || null,
      productName: r.product_name || null,
      quantity: r.quantity ? Number(r.quantity) : null,
    }));

    return NextResponse.json({ refunds }, { status: 200 });
  } catch (error) {
    console.error("Erro ao listar estornos:", error);
    const message = error instanceof Error ? error.message : "Erro ao listar estornos";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
