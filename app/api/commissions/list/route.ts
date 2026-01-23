import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query, supabaseAdmin } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type DecodedToken = {
  userId: string;
};

type AuthenticatedUser = {
  id: string;
  first_name: string;
  last_name: string;
  is_admin: boolean;
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

const authenticateUser = async (request: NextRequest): Promise<AuthenticatedUser> => {
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Error("Token de autenticacao nao informado");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    const result = await query(
      `SELECT id, first_name, last_name, is_admin
       FROM users
       WHERE id = $1`,
      [decoded.userId],
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

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateUser(request);
    console.log("[COMMISSIONS LIST] User authenticated:", {
      userId: user.id,
      isAdmin: user.is_admin
    });

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const attendantFilter = searchParams.get("attendantId");
    const statusFilter = searchParams.get("status");
    const dayType = searchParams.get("dayType");
    const saleType = searchParams.get("saleType");

    console.log("[COMMISSIONS LIST] Query params:", {
      startDate,
      endDate,
      attendantFilter,
      statusFilter,
      dayType
    });

    // Usar Supabase para buscar comissões com relacionamentos
    // Implementação com SQL raw para substituir o Supabase query builder que não suporta JOINs no mock
    let whereClauses: string[] = ["1=1"];
    let params: any[] = [];
    let paramIndex = 1;

    let sql = `
      SELECT 
        c.id,
        c.reference_date,
        c.commission_amount,
        c.status,
        c.created_at,
        c.user_id,
        c.sale_id,
        c.sale_item_id,
        json_build_object(
          'id', u.id, 
          'first_name', u.first_name, 
          'last_name', u.last_name
        ) as users,
        json_build_object(
          'id', s.id,
          'sale_number', s.sale_number,
          'subtotal', s.subtotal,
          'total_discount', s.total_discount,
          'total', s.total,
          'refund_total', s.refund_total,
          'client_id', s.client_id,
          'clients', json_build_object('name', cl.name)
        ) as sales,
        json_build_object(
          'product_name', si.product_name,
          'quantity', si.quantity,
          'sale_type', si.sale_type
        ) as sale_items
      FROM commissions c
      INNER JOIN users u ON c.user_id = u.id
      INNER JOIN sales s ON c.sale_id = s.id
      INNER JOIN clients cl ON s.client_id = cl.id
      INNER JOIN sale_items si ON c.sale_item_id = si.id
    `;

    // GARANTIA: Nunca mostrar tipo 02 (Pacote)
    if (saleType && ["01", "03"].includes(saleType)) {
      whereClauses.push(`si.sale_type = $${paramIndex++}`);
      params.push(saleType);
    } else {
      whereClauses.push(`si.sale_type IN ('01', '03')`);
    }

    if (!user.is_admin) {
      whereClauses.push(`c.user_id = $${paramIndex++}`);
      params.push(user.id);
    } else if (attendantFilter) {
      whereClauses.push(`c.user_id = $${paramIndex++}`);
      params.push(attendantFilter);
    }

    if (startDate) {
      whereClauses.push(`c.reference_date >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      whereClauses.push(`c.reference_date <= $${paramIndex++}`);
      params.push(endDate);
    }

    if (statusFilter) {
      whereClauses.push(`c.status = $${paramIndex++}`);
      params.push(statusFilter);
    }

    sql += ` WHERE ${whereClauses.join(' AND ')}`;
    sql += ` ORDER BY c.reference_date DESC, c.created_at DESC`;

    const { rows: commissionsData } = await query(sql, params);
    // Erro de comissao removido pois query() lança erro se falhar

    console.log("[COMMISSIONS LIST] Commissions fetched:", commissionsData?.length || 0);

    // Processar dados e calcular day_type
    const commissions = (commissionsData || []).map((row: any) => {
      const refDate = new Date(row.reference_date);
      const dayOfWeek = refDate.getDay();
      const isDayType = dayOfWeek === 0 || dayOfWeek === 6 ? "non_working" : "weekday";

      const userData = Array.isArray(row.users) ? row.users[0] : row.users;
      const saleData = Array.isArray(row.sales) ? row.sales[0] : row.sales;
      const clientData = saleData?.clients ? (Array.isArray(saleData.clients) ? saleData.clients[0] : saleData.clients) : null;
      const saleItemData = row.sale_items ? (Array.isArray(row.sale_items) ? row.sale_items[0] : row.sale_items) : null;

      return {
        id: row.id,
        referenceDate: row.reference_date,
        amount: Number(row.commission_amount),
        status: row.status,
        createdAt: row.created_at,
        attendantId: row.user_id,
        attendantName: userData ? `${userData.first_name} ${userData.last_name}`.trim() : "N/A",
        saleId: row.sale_id,
        saleNumber: saleData?.sale_number ?? null,
        saleSubtotal: saleData?.subtotal !== undefined ? Number(saleData.subtotal) : null,
        saleDiscount: saleData?.total_discount !== undefined ? Number(saleData.total_discount) : null,
        saleTotal: saleData?.total !== undefined ? Number(saleData.total) : null,
        refundTotal: saleData?.refund_total !== undefined ? Number(saleData.refund_total) : null,
        saleNetTotal:
          saleData?.total !== undefined
            ? Number(saleData.total) - Number(saleData.refund_total ?? 0)
            : null,
        dayType: isDayType,
        clientName: clientData?.name || "N/A",
        productName: saleItemData?.product_name || "N/A",
        itemQuantity: saleItemData?.quantity !== undefined ? Number(saleItemData.quantity) : null,
        saleType: saleItemData?.sale_type || "01",
      };
    });

    // Filtrar por dayType se especificado (não é possível filtrar diretamente no SQL)
    const filteredCommissions = dayType
      ? commissions.filter((c: any) => c.dayType === dayType)
      : commissions;

    console.log("[COMMISSIONS LIST] Returning commissions:", filteredCommissions.length);

    return NextResponse.json({ commissions: filteredCommissions });
  } catch (error) {
    console.error("Erro ao listar comissoes:", error);
    const message = error instanceof Error ? error.message : "Erro ao listar comissoes";
    const status = message.includes("autenticacao") || message.includes("Token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
