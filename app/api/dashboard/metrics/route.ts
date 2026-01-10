import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { supabaseAdmin, query } from "@/lib/db";

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

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const normalizeServiceSql = (value: string) => `
  LOWER(
    TRANSLATE(
      TRIM(${value}),
      '\u00C1\u00C0\u00C2\u00C3\u00C4\u00C5\u00E1\u00E0\u00E2\u00E3\u00E4\u00E5\u00C9\u00C8\u00CA\u00CB\u00E9\u00E8\u00EA\u00EB\u00CD\u00CC\u00CE\u00CF\u00ED\u00EC\u00EE\u00EF\u00D3\u00D2\u00D4\u00D5\u00D6\u00F3\u00F2\u00F4\u00F5\u00F6\u00DA\u00D9\u00DB\u00DC\u00FA\u00F9\u00FB\u00FC\u00C7\u00E7',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
    )
  )
`;

const getTokenFromRequest = (request: NextRequest) => {
  const cookieToken = request.cookies.get("token")?.value;
  if (cookieToken) {
    return cookieToken;
  }

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
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id, first_name, last_name, email, is_admin")
      .eq("id", decoded.userId)
      .single();

    if (error || !user) {
      throw new Error("Usuario nao encontrado");
    }

    return user;
  } catch (error) {
    console.error("Falha na autenticacao:", error);
    throw new Error("Falha na autenticacao");
  }
};

type FilterOptions = {
  includePeriod?: boolean;
  includeService?: boolean;
  saleAlias?: string;
  saleItemAlias?: string;
  serviceAlias?: string;
  applyUserFilter?: boolean;
  paramOffset?: number;
  adminAttendantId?: string | null;
  dayType?: string | null;
  saleType?: string | null;
  includeSaleType?: boolean;
  includeDayType?: boolean;
};

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateUser(request);
    const { searchParams } = new URL(request.url);
    const adminAttendantId = user.is_admin ? searchParams.get("attendantId") : null;

    const requestedPeriod = Number(searchParams.get("periodDays"));
    const rawStartDate = searchParams.get("startDate");
    const rawEndDate = searchParams.get("endDate");
    const serviceFilterRaw = searchParams.get("serviceName");
    const normalizedServiceName = serviceFilterRaw
      ? normalizeText(serviceFilterRaw)
      : null;
    const dayType = searchParams.get("dayType");
    const saleType = searchParams.get("saleType");

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    let startDate: string | null = null;
    let endDate: string | null = null;
    let useCustomRange = false;

    if (
      rawStartDate &&
      rawEndDate &&
      dateRegex.test(rawStartDate) &&
      dateRegex.test(rawEndDate)
    ) {
      const startMs = Date.parse(rawStartDate);
      const endMs = Date.parse(rawEndDate);
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && startMs <= endMs) {
        startDate = rawStartDate;
        endDate = rawEndDate;
        useCustomRange = true;
      }
    }

    const periodDays = Number.isFinite(requestedPeriod)
      ? Math.min(Math.max(requestedPeriod, 7), 180)
      : 30;

    const analysisPeriodDays = useCustomRange
      ? Math.floor(
        (Date.parse(endDate!) - Date.parse(startDate!)) / (1000 * 60 * 60 * 24),
      ) + 1
      : periodDays;

    const buildFilters = ({
      includePeriod = false,
      includeService = false,
      saleAlias = "s",
      saleItemAlias = "si",
      serviceAlias = "serv",
      applyUserFilter = true,
      paramOffset = 0,
      adminAttendantId = null,
      dayType = null,
      saleType = null,
      includeSaleType = true,
      includeDayType = true,
      customParams = [] as any[],
    }: FilterOptions & { customParams?: any[] } = {}) => {
      const clauses: string[] = [];
      const params = customParams;

      const getNextIdx = () => params.length + 1;

      if (applyUserFilter) {
        if (!user.is_admin) {
          clauses.push(`${saleAlias}.attendant_id = $${getNextIdx()}`);
          params.push(user.id);
        } else if (adminAttendantId) {
          clauses.push(`${saleAlias}.attendant_id = $${getNextIdx()}`);
          params.push(adminAttendantId);
        }
      }

      if (includePeriod) {
        if (useCustomRange && startDate && endDate) {
          clauses.push(`(${saleAlias}.sale_date AT TIME ZONE 'America/Sao_Paulo')::date >= $${getNextIdx()}::date`);
          params.push(startDate);
          clauses.push(`(${saleAlias}.sale_date AT TIME ZONE 'America/Sao_Paulo')::date <= $${getNextIdx()}::date`);
          params.push(endDate);
        } else {
          clauses.push(
            `(${saleAlias}.sale_date AT TIME ZONE 'America/Sao_Paulo')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - $${getNextIdx()} * INTERVAL '1 day'`,
          );
          params.push(periodDays);
        }
      }

      if (includeService && normalizedServiceName) {
        const expr = normalizeServiceSql(
          `COALESCE(${serviceAlias}.name, ${saleItemAlias}.product_name)`,
        );
        clauses.push(`${expr} = $${getNextIdx()}`);
        params.push(normalizedServiceName);
      }

      if (includeSaleType && saleType) {
        if (saleType === "common") {
          clauses.push(`${saleItemAlias}.sale_type != '03'`);
        } else {
          clauses.push(`${saleItemAlias}.sale_type = $${getNextIdx()}`);
          params.push(saleType);
        }
      }

      if (includeDayType && dayType) {
        if (dayType === "weekday") {
          clauses.push(`EXTRACT(DOW FROM ${saleAlias}.sale_date AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5`);
        } else if (dayType === "non_working") {
          clauses.push(`EXTRACT(DOW FROM ${saleAlias}.sale_date AT TIME ZONE 'America/Sao_Paulo') IN (0, 6)`);
        }
      }

      const clause = clauses.length ? ` AND ${clauses.join(" AND ")}` : "";
      return { clause, params };
    };

    const normalizedExpr = normalizeServiceSql(
      "COALESCE(serv.name, si.product_name)",
    );

    // Verificar se a tabela client_package_consumptions existe
    let hasConsumptionsTable = false;
    try {
      const tableCheck = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'client_package_consumptions'
        ) as exists
      `);
      hasConsumptionsTable = tableCheck.rows[0]?.exists || false;
    } catch (err) {
      console.warn("Error checking for client_package_consumptions table:", err);
    }

    // ========== REFACTORED: Using direct JOINs instead of saleIds + IN clause ==========
    // This avoids Supabase's limit on IN clause size (~300-500 items)

    const baseFilters = buildFilters({
      includePeriod: true,
      includeService: true,
      adminAttendantId,
      dayType,
      saleType,
    });

    // Count total sales first (for salesCount metric)
    const salesCountQuery = `
      SELECT COUNT(DISTINCT s.id)::int AS count
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        AND (si.sale_type IS NULL OR si.sale_type != '02') -- Exclude Package Sales (Type 02)
        ${baseFilters.clause}
    `;

    // Period totals - aggregations with inline filters
    const periodTotalsQuery = `
      SELECT
        COALESCE(SUM(si.subtotal), 0)::numeric AS total_value,
        COALESCE(SUM(si.quantity), 0)::int AS total_units,
        COALESCE(SUM(CASE WHEN ${normalizeServiceSql('COALESCE(serv.name, si.product_name)')} LIKE '%reclam%' THEN si.quantity ELSE 0 END), 0)::int AS reclamacoes_units,
        COALESCE(SUM(CASE WHEN si.sale_type = '01' AND ${normalizeServiceSql('COALESCE(serv.name, si.product_name)')} LIKE '%reclam%' THEN si.quantity ELSE 0 END), 0)::int AS reclamacoes_vendas,
        COALESCE(SUM(CASE WHEN si.sale_type = '03' AND ${normalizeServiceSql('COALESCE(serv.name, si.product_name)')} LIKE '%reclam%' THEN si.quantity ELSE 0 END), 0)::int AS reclamacoes_consumos,
        COALESCE(SUM(CASE WHEN ${normalizeServiceSql('COALESCE(serv.name, si.product_name)')} LIKE '%atras%' THEN si.quantity ELSE 0 END), 0)::int AS atrasos_units,
        COALESCE(SUM(CASE WHEN si.sale_type = '01' AND ${normalizeServiceSql('COALESCE(serv.name, si.product_name)')} LIKE '%atras%' THEN si.quantity ELSE 0 END), 0)::int AS atrasos_vendas,
        COALESCE(SUM(CASE WHEN si.sale_type = '03' AND ${normalizeServiceSql('COALESCE(serv.name, si.product_name)')} LIKE '%atras%' THEN si.quantity ELSE 0 END), 0)::int AS atrasos_consumos
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        AND si.sale_type != '02' -- Exclude Package Sales (Type 02)
        ${baseFilters.clause}
    `;

    // Sales-level aggregations (refund, commission, discount)
    const salesAggQuery = `
      SELECT
        COALESCE(SUM(s.refund_total), 0)::numeric AS total_refund,
        COALESCE(SUM(s.commission_amount), 0)::numeric AS total_commission,
        COALESCE(SUM(s.total_discount), 0)::numeric AS total_discount
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        AND (si.sale_type IS NULL OR si.sale_type != '02') -- Exclude Package Sales (Type 02)
        ${baseFilters.clause}
    `;

    const pendingFilters = buildFilters({
      includePeriod: true,
      includeService: true,
      adminAttendantId,
      dayType,
      saleType,
    });

    const pendingQuery = `
      SELECT COUNT(DISTINCT s.id)::int AS count
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status = 'aberta'
        ${pendingFilters.clause}
    `;

    const packagesFilters = buildFilters({
      includePeriod: false,
      includeService: false,
      saleAlias: "sp",
      applyUserFilter: true,
      adminAttendantId,
      dayType,
      saleType,
    });

    const packagesQuery = `
      SELECT COUNT(*)::int AS count
      FROM client_packages cp
      JOIN sales sp ON cp.sale_id = sp.id
      LEFT JOIN sale_items si ON si.sale_id = sp.id
      WHERE cp.is_active = true
        AND cp.available_quantity > 0
        AND (cp.expires_at IS NULL OR (cp.expires_at AT TIME ZONE 'America/Sao_Paulo')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date)
        ${packagesFilters.clause}
    `;

    const topServicesQuery = `
      SELECT
        MAX(COALESCE(
          NULLIF(TRIM(serv.name), ''),
          NULLIF(TRIM(si.product_name), ''),
          'Nao informado'
        )) AS name,
        COUNT(DISTINCT s.id) AS sale_count,
        COALESCE(SUM(si.subtotal), 0)::numeric AS total_revenue
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        AND si.sale_type != '02' -- Exclude Package Sales (Type 02)
        ${baseFilters.clause}
      GROUP BY serv.id, si.product_name
      ORDER BY sale_count DESC, total_revenue DESC
      LIMIT 5
    `;

    const recentSalesQuery = `
      SELECT
        s.id,
        COALESCE(c.name, 'Cliente sem nome') AS client_name,
        s.total,
        s.status,
        s.sale_date
      FROM sales s
      JOIN clients c ON s.client_id = c.id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        AND (si.sale_type IS NULL OR si.sale_type != '02') -- Exclude Package Sales (Type 02)
        ${baseFilters.clause}
      GROUP BY s.id, c.name
      ORDER BY s.sale_date DESC, s.created_at DESC
      LIMIT 5
    `;

    const servicePerformanceQuery = `
      SELECT
        MAX(COALESCE(
          NULLIF(TRIM(serv.name), ''),
          NULLIF(TRIM(si.product_name), ''),
          'Nao informado'
        )) AS service_name,
        COALESCE(SUM(si.subtotal), 0)::numeric AS total_value,
        COALESCE(SUM(si.quantity), 0)::int AS total_quantity,
        COUNT(DISTINCT s.id) AS sale_count
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        AND si.sale_type != '02' -- Exclude Package Sales (Type 02)
        ${baseFilters.clause}
      GROUP BY serv.id, si.product_name
      ORDER BY total_value DESC
      LIMIT 6
    `;

    const clientSpendingQuery = `
      SELECT
        MAX(COALESCE(c.name, 'Cliente sem nome')) AS client_name,
        COALESCE(SUM(si.quantity), 0)::int AS total_quantity,
        COALESCE(SUM(si.subtotal), 0)::numeric AS total_value
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      JOIN clients c ON s.client_id = c.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        AND si.sale_type != '02' -- Exclude Package Sales (Type 02)
        ${baseFilters.clause}
      GROUP BY c.id
      ORDER BY total_value DESC
      LIMIT 6
    `;

    const clientFrequencyQuery = `
      SELECT
        MAX(COALESCE(c.name, 'Cliente sem nome')) AS client_name,
        COUNT(DISTINCT s.id)::int AS sales_count
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      JOIN clients c ON s.client_id = c.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        AND si.sale_type != '02' -- Exclude Package Sales (Type 02)
        ${baseFilters.clause}
        AND NOT EXISTS (
          SELECT 1 FROM client_packages cp WHERE cp.sale_id = s.id
        )
      GROUP BY c.id
      ORDER BY sales_count DESC
      LIMIT 6
    `;

    const attendantSpecificParams = [adminAttendantId ?? user.id];
    const attendantPerformanceFilters = buildFilters({
      includePeriod: true,
      includeService: true,
      applyUserFilter: false,
      saleAlias: "s",
      saleItemAlias: "si",
      serviceAlias: "serv",
      adminAttendantId,
      dayType,
      saleType,
      customParams: attendantSpecificParams
    });

    const attendantPerformanceQuery = `
      SELECT
        MAX(COALESCE(
          NULLIF(TRIM(serv.name), ''),
          NULLIF(TRIM(si.product_name), ''),
          'Nao informado'
        )) AS service_name,
        COALESCE(SUM(si.subtotal), 0)::numeric AS total_value,
        COALESCE(SUM(si.quantity), 0)::int AS total_quantity,
        COUNT(DISTINCT s.id) AS sale_count
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        AND s.attendant_id = $1
        AND si.sale_type != '02' -- Exclude Package Sales (Type 02)
        ${attendantPerformanceFilters.clause}
      GROUP BY serv.id, si.product_name
      ORDER BY total_value DESC
    `;

    const attendantTotalsQuery = `
      SELECT
        COALESCE(SUM(si.subtotal), 0)::numeric AS total_value,
        COALESCE(SUM(si.quantity), 0)::int AS total_quantity,
        COUNT(DISTINCT s.id) AS sales_count
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        AND s.attendant_id = $1
        AND si.sale_type != '02' -- Exclude Package Sales (Type 02)
        ${attendantPerformanceFilters.clause}
    `;

    const [
      salesCountResult,
      periodTotalsResult,
      salesAggResult,
      pendingResult,
      packagesResult,
      topServicesResult,
      recentSalesResult,
      servicePerformanceResult,
      clientSpendingResult,
      clientFrequencyResult,
      attendantPerformanceResult,
      attendantTotalsResult,
    ] = await Promise.all([
      query(salesCountQuery, baseFilters.params),
      query(periodTotalsQuery, baseFilters.params),
      query(salesAggQuery, baseFilters.params),
      query(pendingQuery, pendingFilters.params),
      query(packagesQuery, packagesFilters.params),
      query(topServicesQuery, baseFilters.params),
      query(recentSalesQuery, baseFilters.params),
      query(servicePerformanceQuery, baseFilters.params),
      query(clientSpendingQuery, baseFilters.params),
      query(clientFrequencyQuery, baseFilters.params),
      query(attendantPerformanceQuery, attendantPerformanceFilters.params),
      query(attendantTotalsQuery, attendantPerformanceFilters.params),
    ]);

    const pendingSales = Number(pendingResult.rows[0]?.count ?? 0);
    const activePackages = Number(packagesResult.rows[0]?.count ?? 0);

    const topServices = topServicesResult.rows.map((row: any) => ({
      name: row.name,
      count: Number(row.sale_count ?? 0),
      total: Number(row.total_revenue ?? 0),
    }));

    const recentSales = recentSalesResult.rows.map((row: any) => ({
      id: row.id,
      clientName: row.client_name,
      total: Number(row.total ?? 0),
      status: row.status,
      saleDate: row.sale_date,
    }));

    const servicePerformance = servicePerformanceResult.rows.map((row: any) => ({
      name: row.service_name,
      totalValue: Number(row.total_value ?? 0),
      totalQuantity: Number(row.total_quantity ?? 0),
      totalSales: Number(row.sale_count ?? 0),
    }));

    const attendantServices = attendantPerformanceResult.rows.map((row: any) => ({
      name: row.service_name,
      totalValue: Number(row.total_value ?? 0),
      totalQuantity: Number(row.total_quantity ?? 0),
      totalSales: Number(row.sale_count ?? 0),
    }));

    // [FIX] Usar os totais da query dedicada em vez do reduce incorreto
    const attendantTotalsRow = attendantTotalsResult.rows[0];
    const attendantTotals = {
      totalValue: Number(attendantTotalsRow?.total_value ?? 0),
      totalQuantity: Number(attendantTotalsRow?.total_quantity ?? 0),
      totalSales: Number(attendantTotalsRow?.sales_count ?? 0),
    };

    const clientSpending = clientSpendingResult.rows.map((row: any) => ({
      clientName: row.client_name,
      totalValue: Number(row.total_value ?? 0),
      totalQuantity: Number(row.total_quantity ?? 0),
    }));

    const clientFrequency = clientFrequencyResult.rows.map((row: any) => ({
      clientName: row.client_name,
      salesCount: Number(row.sales_count ?? 0),
    }));

    const attendantName =
      `${user.first_name} ${user.last_name}`.trim() || user.email;

    // Combine results from the three separate queries
    const salesCount = Number(salesCountResult.rows[0]?.count ?? 0);
    const periodTotalsRow = periodTotalsResult.rows[0] ?? {};
    const salesAggRow = salesAggResult.rows[0] ?? {};

    return NextResponse.json({
      analysisPeriodDays,
      analysisRange:
        useCustomRange && startDate && endDate ? { startDate, endDate } : null,
      periodTotals: {
        salesCount,
        totalValue: Number(periodTotalsRow.total_value ?? 0),
        refundTotal: Number(salesAggRow.total_refund ?? 0),
        totalUnits: Number(periodTotalsRow.total_units ?? 0),
        reclamacoesUnits: Number(periodTotalsRow.reclamacoes_units ?? 0),
        reclamacoesVendas: Number(periodTotalsRow.reclamacoes_vendas ?? 0),
        reclamacoesConsumos: Number(periodTotalsRow.reclamacoes_consumos ?? 0),
        atrasosUnits: Number(periodTotalsRow.atrasos_units ?? 0),
        atrasosVendas: Number(periodTotalsRow.atrasos_vendas ?? 0),
        atrasosConsumos: Number(periodTotalsRow.atrasos_consumos ?? 0),
        totalCommission: Number(salesAggRow.total_commission ?? 0),
        totalDiscount: Number(salesAggRow.total_discount ?? 0),
      },
      activePackages,
      pendingSales,
      topServices,
      recentSales,
      servicePerformance,
      attendantPerformance: {
        attendantName,
        totalValue: attendantTotals.totalValue,
        totalQuantity: attendantTotals.totalQuantity,
        totalSales: attendantTotals.totalSales,
        services: attendantServices,
      },
      clientSpending,
      clientFrequency,
    });
  } catch (error) {
    console.error("Erro ao buscar metricas do dashboard:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao buscar metricas";
    const status = message.includes("autenticacao") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
