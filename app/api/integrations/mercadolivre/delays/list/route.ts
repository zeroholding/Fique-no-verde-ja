import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type JwtPayload = { userId: string };

function getObject(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function getNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function fetchMlJson(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return response.json();
}

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const { searchParams } = new URL(req.url);

    const accountsStr = searchParams.get("accounts"); // comma separated
    const delayRangeFilter = searchParams.get("delay_range"); // specific range
    const onlyDelayed = searchParams.get("only_delayed") === 'true'; // boolean
    const sortParams = searchParams.get("sort") || "recent"; // recent | max_delay | account
    const shippingMode = searchParams.get("shipping_mode") || "all";
    const shippingStatus = searchParams.get("shipping_status") || "all";

    if (!accountsStr) {
      return NextResponse.json({ error: "No accounts provided" }, { status: 400 });
    }

    // Prevent 'relation does not exist' if they load page before first sync
    await query(`
      CREATE TABLE IF NOT EXISTS mercadolivre_delays (
        id VARCHAR(50) NOT NULL,
        ml_user_id VARCHAR(50) NOT NULL,
        user_id VARCHAR(255),
        product_name TEXT,
        shipping_mode VARCHAR(50),
        limit_date TIMESTAMP WITH TIME ZONE,
        shipped_date TIMESTAMP WITH TIME ZONE,
        delay_hours FLOAT,
        delay_range VARCHAR(50),
        status VARCHAR(50),
        logistic_type VARCHAR(50),
        synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      );
    `);

    const accounts = accountsStr.split(",");

    // ========================================================
    // KPIs OFICIAIS do ML — mesma lógica do módulo Reputação
    // GET /users/{ml_user_id} → seller_reputation.transactions
    // ========================================================
    let officialTotalSales = 0;
    let officialTotalDelays = 0;

    // Buscar credenciais para fazer as chamadas à API do ML
    for (const mlUserId of accounts) {
      try {
        const credRes = await query(
          "SELECT access_token FROM mercado_livre_credentials WHERE user_id = $1 AND ml_user_id = $2 LIMIT 1",
          [decoded.userId, mlUserId]
        );
        if (credRes.rows.length === 0) continue;

        const accessToken = credRes.rows[0].access_token;
        const mlData = await fetchMlJson(
          `https://api.mercadolibre.com/users/${mlUserId}`,
          accessToken
        );
        if (!mlData) continue;

        const transactions = getObject(getObject(mlData.seller_reputation).transactions);
        const delayedMetric = getObject(transactions.delayed_handling_time);
        const completedCount = getNumber(transactions.completed) || 0;
        const delayedCount = getNumber(delayedMetric.value) || 0;

        officialTotalSales += completedCount;
        officialTotalDelays += delayedCount;
      } catch (e) {
        console.warn(`Failed to fetch ML reputation for account ${mlUserId}:`, e);
      }
    }

    // ========================================================
    // TABLE DATA — do banco local (sincronizado pelo sync route)
    // ========================================================
    const whereConditions: string[] = ["user_id = $1"];
    const queryParams: any[] = [decoded.userId];

    // Filter by accounts
    const accountPlaceholders = accounts.map((_, i) => `$${queryParams.length + i + 1}`);
    whereConditions.push(`ml_user_id IN (${accountPlaceholders.join(",")})`);
    queryParams.push(...accounts);

    // Only within last 60 days
    whereConditions.push(`limit_date >= NOW() - INTERVAL '60 days'`);

    // Only Delayed filter
    if (onlyDelayed) {
      whereConditions.push(`delay_range != 'no_delay'`);
    }

    // Specific Range filter
    if (delayRangeFilter && delayRangeFilter !== "all") {
      whereConditions.push(`delay_range = $${queryParams.length + 1}`);
      queryParams.push(delayRangeFilter);
    }

    // Shipping Mode filter
    if (shippingMode && shippingMode !== "all") {
      whereConditions.push(`logistic_type = $${queryParams.length + 1}`);
      queryParams.push(shippingMode);
    }

    // Shipping Status filter
    if (shippingStatus === "shipped") {
      whereConditions.push(`shipped_date IS NOT NULL`);
    } else if (shippingStatus === "pending") {
      whereConditions.push(`shipped_date IS NULL`);
    }

    // Build Order By
    let orderBy = "limit_date DESC";
    if (sortParams === "max_delay") {
      orderBy = "delay_hours DESC";
    } else if (sortParams === "account") {
      orderBy = "ml_user_id ASC, limit_date DESC";
    }

    const whereClause = whereConditions.join(" AND ");

    const listQuery = `
      SELECT *
      FROM mercadolivre_delays
      WHERE ${whereClause}
      ORDER BY ${orderBy}
    `;

    const listRes = await query(listQuery, queryParams);
    const data = listRes.rows;

    // Ranges from DB (for the breakdown card on the right)
    const kpiWhere = `user_id = $1 AND ml_user_id IN (${accountPlaceholders.join(",")}) AND limit_date >= NOW() - INTERVAL '60 days'`;
    const kpiParams = [decoded.userId, ...accounts];

    const kpiRes = await query(`
      SELECT delay_range, COUNT(id) as count
      FROM mercadolivre_delays
      WHERE ${kpiWhere}
      GROUP BY delay_range
    `, kpiParams);

    const ranges: Record<string, number> = {
      "no_delay": 0,
      "same_day": 0,
      "0-24h": 0,
      "24-48h": 0,
      "48-72h": 0,
      "+72h": 0
    };

    let dbDelayed = 0;
    kpiRes.rows.forEach((r: any) => {
      const count = parseInt(r.count, 10);
      if (r.delay_range !== 'no_delay') {
        dbDelayed += count;
      }
      if (ranges[r.delay_range] !== undefined) {
        ranges[r.delay_range] += count;
      }
    });

    // KPIs: usar dados oficiais do ML pra totalSynced e totalDelayed
    // E os ranges da tabela local pra detalhamento por faixa
    const totalSynced = officialTotalSales;
    const totalDelayed = officialTotalDelays;
    const delayedPercentage = totalSynced > 0 ? (totalDelayed / totalSynced) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: data,
      kpis: {
        totalSynced,
        totalDelayed,
        delayedPercentage,
        ranges
      }
    });

  } catch (error: any) {
    console.error("Error listing delays:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
