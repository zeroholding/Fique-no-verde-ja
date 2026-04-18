import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type JwtPayload = { userId: string };

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
    
    // Base WHERE
    const whereConditions: string[] = ["user_id = $1"];
    const queryParams: any[] = [decoded.userId];

    // Filter by accounts
    const accountPlaceholders = accounts.map((_, i) => `$${queryParams.length + i + 1}`);
    whereConditions.push(`ml_user_id IN (${accountPlaceholders.join(",")})`);
    queryParams.push(...accounts);

    // Only within last 60 days to match Reputação timeframe
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

    // Build KPIs from the same filtered accounts but ignoring the specific table filters (like onlyDelayed) to give accurate global numbers
    const kpiWhere = `user_id = $1 AND ml_user_id IN (${accountPlaceholders.join(",")}) AND limit_date >= NOW() - INTERVAL '60 days'`;
    const kpiParams = [decoded.userId, ...accounts];
    
    const kpiRes = await query(`
      SELECT delay_range, COUNT(id) as count
      FROM mercadolivre_delays
      WHERE ${kpiWhere}
      GROUP BY delay_range
    `, kpiParams);

    // Parse KPIs
    let totalSynced = 0;
    let totalDelayed = 0;
    const ranges = {
      "no_delay": 0,
      "same_day": 0,
      "0-24h": 0,
      "24-48h": 0,
      "48-72h": 0,
      "+72h": 0
    };

    kpiRes.rows.forEach(r => {
       const count = parseInt(r.count, 10);
       totalSynced += count;
       if (r.delay_range !== 'no_delay') {
          totalDelayed += count;
       }
       // @ts-ignore
       if (ranges[r.delay_range] !== undefined) {
          // @ts-ignore
          ranges[r.delay_range] += count;
       }
    });

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
