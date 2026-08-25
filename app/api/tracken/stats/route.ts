import { NextRequest, NextResponse } from "next/server";
import { authenticatePanelUser } from "@/lib/tracken/auth";
import { trackenQuery } from "@/lib/tracken/db";
import { toErrorResponse } from "@/lib/tracken/errors";
import {
  PANEL_TIMEZONE,
  buildTicketFilters,
  parsePanelFilters,
} from "@/lib/tracken/filters";

/**
 * GET /api/tracken/stats
 * Alimenta os 5 KPIs e os 4 graficos do Painel de Atendimento.
 *
 * Os numeros usam exatamente o mesmo construtor de filtros da listagem, para
 * que KPI e tabela nunca contem historias diferentes.
 */

export const dynamic = "force-dynamic";

/** Meta de SLA exibida no gauge. */
const SLA_TARGET_PERCENT = 90;

const FROM_TICKETS = `
  FROM tracken_tickets t
  LEFT JOIN tracken_carriers c ON c.id = t.carrier_id
  LEFT JOIN tracken_status_map sm ON sm.code = t.status
`;

export async function GET(request: NextRequest) {
  try {
    const user = await authenticatePanelUser(request);

    const { searchParams } = new URL(request.url);
    const filters = parsePanelFilters(searchParams);
    const scoped = buildTicketFilters(filters, user.id);

    // O grafico de tendencia e o contador "hoje" ignoram o periodo escolhido,
    // mas respeitam os demais filtros.
    const undated = buildTicketFilters(
      { ...filters, startDate: null, endDate: null },
      user.id
    );

    const [
      statusCounts,
      todayCount,
      carrierCounts,
      trend,
      sla,
      statusCatalog,
    ] = await Promise.all([
      trackenQuery<{ status: string; total: string }>(
        `SELECT t.status, COUNT(*)::text AS total
         ${FROM_TICKETS}
         ${scoped.clause}
         GROUP BY t.status`,
        scoped.params
      ),

      trackenQuery<{ total: string }>(
        `SELECT COUNT(*)::text AS total
         ${FROM_TICKETS}
         ${undated.clause}
         ${undated.clause ? "AND" : "WHERE"}
           (t.received_at AT TIME ZONE '${PANEL_TIMEZONE}')::date
             = (CURRENT_TIMESTAMP AT TIME ZONE '${PANEL_TIMEZONE}')::date`,
        undated.params
      ),

      trackenQuery<{
        code: string | null;
        name: string | null;
        color: string | null;
        total: string;
      }>(
        `SELECT c.code, c.name, c.color, COUNT(*)::text AS total
         ${FROM_TICKETS}
         ${scoped.clause}
         GROUP BY c.code, c.name, c.color
         ORDER BY COUNT(*) DESC`,
        scoped.params
      ),

      trackenQuery<{ day: string; total: string }>(
        `WITH dias AS (
           SELECT generate_series(
             (CURRENT_TIMESTAMP AT TIME ZONE '${PANEL_TIMEZONE}')::date
               - INTERVAL '6 days',
             (CURRENT_TIMESTAMP AT TIME ZONE '${PANEL_TIMEZONE}')::date,
             INTERVAL '1 day'
           )::date AS day
         ),
         recebidos AS (
           SELECT (t.received_at AT TIME ZONE '${PANEL_TIMEZONE}')::date AS day,
                  COUNT(*) AS total
           ${FROM_TICKETS}
           ${undated.clause}
           GROUP BY 1
         )
         SELECT dias.day::text AS day,
                COALESCE(recebidos.total, 0)::text AS total
           FROM dias
           LEFT JOIN recebidos ON recebidos.day = dias.day
          ORDER BY dias.day`,
        undated.params
      ),

      trackenQuery<{ within: string; measured: string }>(
        `SELECT
           COUNT(*) FILTER (
             WHERE t.finished_at <= t.shipping_deadline
           )::text AS within,
           COUNT(*)::text AS measured
         ${FROM_TICKETS}
         ${scoped.clause}
         ${scoped.clause ? "AND" : "WHERE"}
           sm.is_final = true
           AND sm.counts_as_sla = true
           AND t.finished_at IS NOT NULL
           AND t.shipping_deadline IS NOT NULL`,
        scoped.params
      ),

      trackenQuery<{
        code: string;
        label: string;
        color: string;
        sort_order: number;
      }>(
        `SELECT code, label, color, sort_order
           FROM tracken_status_map
          WHERE is_active = true
          ORDER BY sort_order`
      ),
    ]);

    const countByStatus = new Map(
      statusCounts.rows.map((row) => [row.status, Number(row.total)])
    );
    const total = Array.from(countByStatus.values()).reduce(
      (sum, value) => sum + value,
      0
    );

    const byStatus = statusCatalog.rows.map((status) => {
      const count = countByStatus.get(status.code) ?? 0;
      return {
        code: status.code,
        label: status.label,
        color: status.color,
        count,
        percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
      };
    });

    const byCarrier = carrierCounts.rows
      .filter((row) => row.code !== null)
      .map((row) => {
        const count = Number(row.total);
        return {
          code: row.code as string,
          name: row.name ?? row.code as string,
          color: row.color ?? "slate",
          count,
          percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
        };
      });

    const measured = Number(sla.rows[0]?.measured ?? 0);
    const within = Number(sla.rows[0]?.within ?? 0);

    return NextResponse.json({
      kpis: {
        total,
        today: Number(todayCount.rows[0]?.total ?? 0),
        byStatus,
      },
      charts: {
        byCarrier,
        byStatus,
        trend: trend.rows.map((row) => ({
          date: row.day,
          count: Number(row.total),
        })),
        sla: {
          percentage:
            measured > 0 ? Number(((within / measured) * 100).toFixed(1)) : 0,
          target: SLA_TARGET_PERCENT,
          within,
          measured,
        },
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
