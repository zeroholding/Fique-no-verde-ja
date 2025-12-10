import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query, supabaseAdmin } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type DecodedToken = {
  userId: string;
};

const getTokenFromRequest = (request: NextRequest) => {
  const cookieToken = request.cookies.get("token")?.value;
  if (cookieToken) return cookieToken;
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return null;
};

const authenticateAdmin = async (request: NextRequest) => {
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Error("Token de autenticacao nao informado");
  }

  let decoded: DecodedToken;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
  } catch {
    throw new Error("Token invalido");
  }

  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("id, is_admin")
    .eq("id", decoded.userId)
    .single();

  if (error || !user) {
    throw new Error("Usuario nao encontrado");
  }

  if (!user.is_admin) {
    throw new Error("Acesso restrito a administradores");
  }

  return user;
};

export async function GET(request: NextRequest) {
  try {
    await authenticateAdmin(request);

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const attendantId = searchParams.get("attendantId");
    const status = searchParams.get("status");

    let sql = `
      SELECT
        c.id,
        c.reference_date,
        c.commission_amount,
        c.status,
        c.created_at,
        c.user_id as attendant_id,
        u.first_name,
        u.last_name,
        s.id as sale_id,
        cl.name as client_name,
        si.product_name
      FROM commissions c
      JOIN users u ON c.user_id = u.id
      JOIN sales s ON c.sale_id = s.id
      JOIN clients cl ON s.client_id = cl.id
      LEFT JOIN sale_items si ON c.sale_item_id = si.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 0;

    if (startDate) {
      paramCount++;
      sql += ` AND c.reference_date >= $${paramCount}`;
      params.push(startDate);
    }
    if (endDate) {
      paramCount++;
      // Ajuste para incluir o dia todo se for data apenas
      sql += ` AND c.reference_date <= $${paramCount}`;
      params.push(endDate);
    }
    if (attendantId) {
      paramCount++;
      sql += ` AND c.user_id = $${paramCount}`;
      params.push(attendantId);
    }
    if (status) {
      paramCount++;
      sql += ` AND c.status = $${paramCount}`;
      params.push(status);
    }

    sql += ` ORDER BY c.reference_date DESC, c.created_at DESC`;

    const result = await query(sql, params);

    const commissions = result.rows.map((row: any) => ({
      id: row.id,
      referenceDate: row.reference_date,
      amount: Number(row.commission_amount),
      status: row.status,
      createdAt: row.created_at,
      attendantId: row.attendant_id,
      attendantName: `${row.first_name} ${row.last_name}`.trim(),
      saleId: row.sale_id,
      clientName: row.client_name,
      productName: row.product_name || "N/A",
    }));

    return NextResponse.json({ commissions });
  } catch (error) {
    console.error("Erro ao listar comissoes:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao listar comissoes";
    const status = message.includes("Acesso restrito") || message.includes("Token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
