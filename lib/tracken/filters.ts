/**
 * Construcao dos filtros do painel.
 *
 * Compartilhado entre a listagem e as estatisticas para que os numeros dos
 * KPIs e as linhas da tabela nunca divirjam.
 *
 * Todas as datas sao interpretadas no fuso America/Sao_Paulo, que e o fuso da
 * operacao. O banco guarda TIMESTAMPTZ, entao a conversao e explicita.
 */

export const PANEL_TIMEZONE = "America/Sao_Paulo";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export type DeadlineBucket =
  | "all"
  | "overdue"
  | "today"
  | "next_24h"
  | "next_48h";

export type PanelFilters = {
  startDate: string | null;
  endDate: string | null;
  carrierCode: string | null;
  status: string | null;
  serviceType: string | null;
  deadline: DeadlineBucket;
  search: string | null;
  assignedToMe: boolean;
};

export function parsePanelFilters(searchParams: URLSearchParams): PanelFilters {
  const rawStart = searchParams.get("startDate");
  const rawEnd = searchParams.get("endDate");

  const startDate = rawStart && DATE_REGEX.test(rawStart) ? rawStart : null;
  const endDate = rawEnd && DATE_REGEX.test(rawEnd) ? rawEnd : null;

  const deadlineParam = (searchParams.get("deadline") ?? "all") as DeadlineBucket;
  const allowedBuckets: DeadlineBucket[] = [
    "all",
    "overdue",
    "today",
    "next_24h",
    "next_48h",
  ];

  const search = searchParams.get("search")?.trim();

  return {
    startDate,
    endDate:
      startDate && endDate && endDate < startDate ? startDate : endDate,
    carrierCode: searchParams.get("carrier")?.trim().toUpperCase() || null,
    status: searchParams.get("status")?.trim() || null,
    serviceType: searchParams.get("serviceType")?.trim() || null,
    deadline: allowedBuckets.includes(deadlineParam) ? deadlineParam : "all",
    search: search && search.length > 0 ? search.slice(0, 120) : null,
    assignedToMe: searchParams.get("assignedToMe") === "true",
  };
}

export type BuiltFilters = {
  clause: string;
  params: unknown[];
};

/**
 * Monta o WHERE da consulta.
 *
 * @param aliases nomes das tabelas na consulta (`t` para tickets, `c` para
 *                transportadoras)
 * @param currentUserId usado apenas quando o filtro "meus atendimentos" esta on
 */
export function buildTicketFilters(
  filters: PanelFilters,
  currentUserId: string | null
): BuiltFilters {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const push = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.startDate) {
    conditions.push(
      `(t.received_at AT TIME ZONE '${PANEL_TIMEZONE}')::date >= ${push(
        filters.startDate
      )}::date`
    );
  }

  if (filters.endDate) {
    conditions.push(
      `(t.received_at AT TIME ZONE '${PANEL_TIMEZONE}')::date <= ${push(
        filters.endDate
      )}::date`
    );
  }

  if (filters.carrierCode) {
    conditions.push(`c.code = ${push(filters.carrierCode)}`);
  }

  if (filters.status) {
    conditions.push(`t.status = ${push(filters.status)}`);
  }

  if (filters.serviceType) {
    conditions.push(`t.service_type = ${push(filters.serviceType)}`);
  }

  switch (filters.deadline) {
    case "overdue":
      conditions.push(
        `t.shipping_deadline IS NOT NULL AND t.shipping_deadline < CURRENT_TIMESTAMP`
      );
      break;
    case "today":
      conditions.push(
        `t.shipping_deadline IS NOT NULL
         AND (t.shipping_deadline AT TIME ZONE '${PANEL_TIMEZONE}')::date
             = (CURRENT_TIMESTAMP AT TIME ZONE '${PANEL_TIMEZONE}')::date`
      );
      break;
    case "next_24h":
      conditions.push(
        `t.shipping_deadline IS NOT NULL
         AND t.shipping_deadline BETWEEN CURRENT_TIMESTAMP
             AND CURRENT_TIMESTAMP + INTERVAL '24 hours'`
      );
      break;
    case "next_48h":
      conditions.push(
        `t.shipping_deadline IS NOT NULL
         AND t.shipping_deadline BETWEEN CURRENT_TIMESTAMP
             AND CURRENT_TIMESTAMP + INTERVAL '48 hours'`
      );
      break;
    default:
      break;
  }

  if (filters.search) {
    const placeholder = push(`%${filters.search}%`);
    conditions.push(
      `(t.shipment_id ILIKE ${placeholder}
        OR t.order_id ILIKE ${placeholder}
        OR t.buyer_nickname ILIKE ${placeholder}
        OR t.buyer_name ILIKE ${placeholder}
        OR t.seller_name ILIKE ${placeholder}
        OR t.tracking_number ILIKE ${placeholder})`
    );
  }

  if (filters.assignedToMe && currentUserId) {
    conditions.push(`t.assigned_user_id = ${push(currentUserId)}`);
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}
