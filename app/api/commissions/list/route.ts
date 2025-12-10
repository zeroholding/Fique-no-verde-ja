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

    console.log("[COMMISSIONS LIST] Query params:", {
      startDate,
      endDate,
      attendantFilter,
      statusFilter,
      dayType
    });

    // Usar Supabase para buscar comissões com relacionamentos
    let queryBuilder = supabaseAdmin
      .from("commissions")
      .select(`
        id,
        reference_date,
        commission_amount,
        status,
        created_at,
        user_id,
        sale_id,
        sale_item_id,
        users!inner (
          id,
          first_name,
          last_name
        ),
        sales!inner (
          id,
          sale_number,
          subtotal,
          total_discount,
          total,
          refund_total,
          client_id,
          clients!inner (
            name
          )
        ),
        sale_items!inner (
          product_name,
          quantity,
          sale_type
        )
      `)
      .in("sale_items.sale_type", ["01", "03"])
      .order("reference_date", { ascending: false })
      .order("created_at", { ascending: false });

    // Aplicar filtros
    if (!user.is_admin) {
      queryBuilder = queryBuilder.eq("user_id", user.id);
    } else if (attendantFilter) {
      queryBuilder = queryBuilder.eq("user_id", attendantFilter);
    }

    if (startDate) {
      queryBuilder = queryBuilder.gte("reference_date", startDate);
    }

    if (endDate) {
      queryBuilder = queryBuilder.lte("reference_date", endDate);
    }

    if (statusFilter) {
      queryBuilder = queryBuilder.eq("status", statusFilter);
    }

    const { data: commissionsData, error: commissionsError } = await queryBuilder;

    if (commissionsError) {
      console.error("[COMMISSIONS LIST] Supabase error:", commissionsError);
      throw new Error("Erro ao buscar comissoes: " + commissionsError.message);
    }

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
      ? commissions.filter(c => c.dayType === dayType)
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
