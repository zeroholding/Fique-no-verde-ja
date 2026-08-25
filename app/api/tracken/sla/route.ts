import { NextRequest, NextResponse } from "next/server";
import { authenticatePanelUser } from "@/lib/tracken/auth";
import { trackenQuery } from "@/lib/tracken/db";
import { toErrorResponse } from "@/lib/tracken/errors";
import { buildTicketFilters, parsePanelFilters } from "@/lib/tracken/filters";

/**
 * GET /api/tracken/sla
 * Alimenta a tela "SLA & Performance".
 *
 * Definicao de SLA em uso: atendimento finalizado ANTES do limite de envio do
 * Mercado Livre. Depois do limite o atraso ja foi contabilizado pela
 * plataforma, entao esse e o marco que importa para a operacao.
 * (Confirmar com a Tracken - pergunta 15.5 do documento mestre.)
 */

export const dynamic = "force-dynamic";

const SLA_TARGET_PERCENT = 90;

const FROM_TICKETS = `
  FROM tracken_tickets t
  LEFT JOIN tracken_carriers c ON c.id = t.carrier_id
  LEFT JOIN tracken_status_map sm ON sm.code = t.status
`;

/** Restringe a atendimentos finalizados que podem ser medidos. */
const MEASURABLE = `
  sm.is_final = true
  AND sm.counts_as_sla = true
  AND t.finished_at IS NOT NULL
  AND t.shipping_deadline IS NOT NULL
`;

type Aggregate = {
  chave: string | null;
  rotulo: string | null;
  cor: string | null;
  medidos: string;
  no_prazo: string;
  minutos_ate_inicio: string | null;
  minutos_ate_fim: string | null;
};

const toBreakdown = (rows: Aggregate[]) =>
  rows
    .filter((row) => row.chave !== null)
    .map((row) => {
      const medidos = Number(row.medidos);
      const noPrazo = Number(row.no_prazo);
      return {
        key: row.chave as string,
        label: row.rotulo ?? (row.chave as string),
        color: row.cor ?? "slate",
        measured: medidos,
        within: noPrazo,
        late: medidos - noPrazo,
        percentage:
          medidos > 0 ? Number(((noPrazo / medidos) * 100).toFixed(1)) : 0,
        avgMinutesToStart: row.minutos_ate_inicio
          ? Math.round(Number(row.minutos_ate_inicio))
          : null,
        avgMinutesToFinish: row.minutos_ate_fim
          ? Math.round(Number(row.minutos_ate_fim))
          : null,
      };
    });

export async function GET(request: NextRequest) {
  try {
    const user = await authenticatePanelUser(request);

    const { searchParams } = new URL(request.url);
    const filters = parsePanelFilters(searchParams);
    const { clause, params } = buildTicketFilters(filters, user.id);

    const and = clause ? "AND" : "WHERE";

    const [geral, porTransportadora, porAtendente, emAberto] =
      await Promise.all([
        trackenQuery<Aggregate>(
          `SELECT 'geral' AS chave, 'Geral' AS rotulo, NULL AS cor,
                  COUNT(*)::text AS medidos,
                  COUNT(*) FILTER (
                    WHERE t.finished_at <= t.shipping_deadline
                  )::text AS no_prazo,
                  AVG(
                    EXTRACT(EPOCH FROM (t.started_at - t.received_at)) / 60
                  )::text AS minutos_ate_inicio,
                  AVG(
                    EXTRACT(EPOCH FROM (t.finished_at - t.received_at)) / 60
                  )::text AS minutos_ate_fim
           ${FROM_TICKETS}
           ${clause}
           ${and} ${MEASURABLE}`,
          params
        ),

        trackenQuery<Aggregate>(
          `SELECT c.code AS chave, c.name AS rotulo, c.color AS cor,
                  COUNT(*)::text AS medidos,
                  COUNT(*) FILTER (
                    WHERE t.finished_at <= t.shipping_deadline
                  )::text AS no_prazo,
                  AVG(
                    EXTRACT(EPOCH FROM (t.started_at - t.received_at)) / 60
                  )::text AS minutos_ate_inicio,
                  AVG(
                    EXTRACT(EPOCH FROM (t.finished_at - t.received_at)) / 60
                  )::text AS minutos_ate_fim
           ${FROM_TICKETS}
           ${clause}
           ${and} ${MEASURABLE}
           GROUP BY c.code, c.name, c.color
           ORDER BY COUNT(*) DESC`,
          params
        ),

        trackenQuery<Aggregate>(
          `SELECT t.assigned_user_id::text AS chave,
                  NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '')
                    AS rotulo,
                  NULL AS cor,
                  COUNT(*)::text AS medidos,
                  COUNT(*) FILTER (
                    WHERE t.finished_at <= t.shipping_deadline
                  )::text AS no_prazo,
                  AVG(
                    EXTRACT(EPOCH FROM (t.started_at - t.received_at)) / 60
                  )::text AS minutos_ate_inicio,
                  AVG(
                    EXTRACT(EPOCH FROM (t.finished_at - t.received_at)) / 60
                  )::text AS minutos_ate_fim
           ${FROM_TICKETS}
           LEFT JOIN users u ON u.id = t.assigned_user_id
           ${clause}
           ${and} ${MEASURABLE}
             AND t.assigned_user_id IS NOT NULL
           GROUP BY t.assigned_user_id, u.first_name, u.last_name
           ORDER BY COUNT(*) DESC`,
          params
        ),

        // Atendimentos ainda abertos, separados por situacao do prazo.
        trackenQuery<{
          vencidos: string;
          proximas_24h: string;
          no_prazo: string;
          sem_limite: string;
        }>(
          `SELECT
             COUNT(*) FILTER (
               WHERE t.shipping_deadline IS NOT NULL
                 AND t.shipping_deadline < CURRENT_TIMESTAMP
             )::text AS vencidos,
             COUNT(*) FILTER (
               WHERE t.shipping_deadline BETWEEN CURRENT_TIMESTAMP
                 AND CURRENT_TIMESTAMP + INTERVAL '24 hours'
             )::text AS proximas_24h,
             COUNT(*) FILTER (
               WHERE t.shipping_deadline > CURRENT_TIMESTAMP + INTERVAL '24 hours'
             )::text AS no_prazo,
             COUNT(*) FILTER (
               WHERE t.shipping_deadline IS NULL
             )::text AS sem_limite
           ${FROM_TICKETS}
           ${clause}
           ${and} sm.is_final = false`,
          params
        ),
      ]);

    const resumo = toBreakdown(geral.rows)[0] ?? {
      key: "geral",
      label: "Geral",
      color: "slate",
      measured: 0,
      within: 0,
      late: 0,
      percentage: 0,
      avgMinutesToStart: null,
      avgMinutesToFinish: null,
    };

    return NextResponse.json({
      target: SLA_TARGET_PERCENT,
      overall: resumo,
      byCarrier: toBreakdown(porTransportadora.rows),
      byAttendant: toBreakdown(porAtendente.rows),
      open: {
        overdue: Number(emAberto.rows[0]?.vencidos ?? 0),
        next24h: Number(emAberto.rows[0]?.proximas_24h ?? 0),
        onTime: Number(emAberto.rows[0]?.no_prazo ?? 0),
        withoutDeadline: Number(emAberto.rows[0]?.sem_limite ?? 0),
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
