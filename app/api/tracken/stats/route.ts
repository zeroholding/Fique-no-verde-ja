import { NextRequest, NextResponse } from "next/server";
import { authenticatePanelUser } from "@/lib/tracken/auth";
import { withClient } from "@/lib/tracken/db";
import { toErrorResponse } from "@/lib/tracken/errors";
import {
  PANEL_TIMEZONE,
  buildTicketFilters,
  mergeClause,
  parsePanelFilters,
} from "@/lib/tracken/filters";
import { describeShippingMode } from "@/lib/tracken/shipping";

/**
 * GET /api/tracken/stats
 * Alimenta os KPIs e os graficos do Painel de Atendimento.
 *
 * Os numeros usam exatamente o mesmo construtor de filtros da listagem, para
 * que KPI e tabela nunca contem historias diferentes.
 *
 * Todas as consultas rodam em UMA conexao, em sequencia. Antes eram seis em
 * paralelo, de um pool de dez, e a tela dispara tres requisicoes ao carregar:
 * dois atendentes simultaneos bastavam para estourar o pool e a tela falhar com
 * erro generico.
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

    const data = await withClient(async (run) => {
      const statusCatalog = await run<{
        code: string;
        label: string;
        color: string;
        sort_order: number;
      }>(
        `SELECT code, label, color, sort_order
           FROM tracken_status_map
          WHERE is_active = true
          ORDER BY sort_order`
      );

      const statusCounts = await run<{ status: string; total: string }>(
        `SELECT t.status, COUNT(*)::text AS total
         ${FROM_TICKETS}
         ${scoped.clause}
         GROUP BY t.status`,
        scoped.params
      );

      const todayCount = await run<{ total: string }>(
        `SELECT COUNT(*)::text AS total
         ${FROM_TICKETS}
         ${mergeClause(
           undated.clause,
           `(t.received_at AT TIME ZONE '${PANEL_TIMEZONE}')::date
             = (CURRENT_TIMESTAMP AT TIME ZONE '${PANEL_TIMEZONE}')::date`
         )}`,
        undated.params
      );

      const carrierCounts = await run<{
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
      );

      const modeCounts = await run<{ mode: string | null; total: string }>(
        `SELECT t.shipping_mode AS mode, COUNT(*)::text AS total
         ${FROM_TICKETS}
         ${scoped.clause}
         GROUP BY t.shipping_mode
         ORDER BY COUNT(*) DESC`,
        scoped.params
      );

      const trend = await run<{ day: string; total: string }>(
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
      );

      const sla = await run<{ within: string; measured: string }>(
        `SELECT
           COUNT(*) FILTER (
             WHERE t.finished_at <= t.shipping_deadline
           )::text AS within,
           COUNT(*)::text AS measured
         ${FROM_TICKETS}
         ${mergeClause(
           scoped.clause,
           `sm.is_final = true
            AND sm.counts_as_sla = true
            AND t.finished_at IS NOT NULL
            AND t.shipping_deadline IS NOT NULL`
         )}`,
        scoped.params
      );

      return { statusCatalog, statusCounts, todayCount, carrierCounts, modeCounts, trend, sla };
    });

    const countByStatus = new Map(
      data.statusCounts.rows.map((row) => [row.status, Number(row.total)])
    );

    // Total de TODOS os atendimentos do periodo, inclusive os que estao em
    // status desativado.
    const total = Array.from(countByStatus.values()).reduce(
      (sum, value) => sum + value,
      0
    );

    const byStatus = data.statusCatalog.rows.map((status) => {
      const count = countByStatus.get(status.code) ?? 0;
      return {
        code: status.code,
        label: status.label,
        color: status.color,
        count,
        percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
      };
    });

    // Atendimentos parados em status que saiu do mapa nao aparecem em card
    // nenhum. Em vez de deixar a soma dos cards nao fechar com o total sem
    // explicacao, isso e informado a parte.
    const mappedStatusCount = byStatus.reduce((sum, item) => sum + item.count, 0);
    const unmappedStatusCount = total - mappedStatusCount;

    // O donut mostra o total no centro; o denominador dele tem de ser a soma
    // das proprias fatias, senao os angulos nao correspondem aos percentuais
    // da legenda.
    const carrierRows = data.carrierCounts.rows.filter(
      (row) => row.code !== null
    );
    const carrierTotal = carrierRows.reduce(
      (sum, row) => sum + Number(row.total),
      0
    );
    const byCarrier = carrierRows.map((row) => {
      const count = Number(row.total);
      return {
        code: row.code as string,
        name: row.name ?? (row.code as string),
        color: row.color ?? "slate",
        count,
        percentage:
          carrierTotal > 0 ? Number(((count / carrierTotal) * 100).toFixed(1)) : 0,
      };
    });

    const byShippingMode = data.modeCounts.rows.map((row) => {
      const info = describeShippingMode(row.mode);
      const count = Number(row.total);
      return {
        code: info?.code ?? null,
        label: info?.label ?? "Não informada",
        color: info?.color ?? "slate",
        isFlex: info?.isFlex ?? false,
        count,
        percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
      };
    });

    const measured = Number(data.sla.rows[0]?.measured ?? 0);
    const within = Number(data.sla.rows[0]?.within ?? 0);

    return NextResponse.json({
      kpis: {
        total,
        today: Number(data.todayCount.rows[0]?.total ?? 0),
        byStatus,
        unmappedStatusCount,
      },
      charts: {
        byCarrier,
        carrierTotal,
        byStatus,
        byShippingMode,
        trend: data.trend.rows.map((row) => ({
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
