/**
 * Construcao dos filtros do painel.
 *
 * Compartilhado entre listagem, estatisticas, SLA e exportacao para que os
 * numeros das telas nunca divirjam.
 *
 * Todas as datas sao interpretadas no fuso da operacao (America/Sao_Paulo). O
 * banco guarda TIMESTAMPTZ, entao a conversao e explicita.
 */

export const PANEL_TIMEZONE = "America/Sao_Paulo";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export type DeadlineBucket =
  | "all"
  | "overdue"
  | "today"
  | "next_24h"
  | "next_48h"
  | "no_deadline";

export type PanelFilters = {
  startDate: string | null;
  endDate: string | null;
  carrierCode: string | null;
  status: string | null;
  serviceType: string | null;
  shippingMode: string | null;
  assignedUserId: string | null;
  deadline: DeadlineBucket;
  search: string | null;
  assignedToMe: boolean;
};

const DEADLINE_BUCKETS: DeadlineBucket[] = [
  "all",
  "overdue",
  "today",
  "next_24h",
  "next_48h",
  "no_deadline",
];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sentinela do filtro de atendente para "ninguem assumiu ainda". */
export const UNASSIGNED = "unassigned";

export function parsePanelFilters(searchParams: URLSearchParams): PanelFilters {
  const rawStart = searchParams.get("startDate");
  const rawEnd = searchParams.get("endDate");

  const startDate = rawStart && DATE_REGEX.test(rawStart) ? rawStart : null;
  const endDate = rawEnd && DATE_REGEX.test(rawEnd) ? rawEnd : null;

  const deadlineParam = (searchParams.get("deadline") ?? "all") as DeadlineBucket;
  const search = searchParams.get("search")?.trim();

  const rawAttendant = searchParams.get("attendant")?.trim() ?? "";
  const assignedUserId =
    rawAttendant === UNASSIGNED || UUID_REGEX.test(rawAttendant)
      ? rawAttendant
      : null;

  return {
    startDate,
    // Intervalo invertido seria silenciosamente vazio; alinhar evita relatorio
    // em branco sem explicacao.
    endDate: startDate && endDate && endDate < startDate ? startDate : endDate,
    carrierCode: searchParams.get("carrier")?.trim().toUpperCase() || null,
    status: searchParams.get("status")?.trim() || null,
    serviceType: searchParams.get("serviceType")?.trim() || null,
    shippingMode: searchParams.get("shippingMode")?.trim() || null,
    assignedUserId,
    deadline: DEADLINE_BUCKETS.includes(deadlineParam) ? deadlineParam : "all",
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
 * Duas decisoes que valem registro:
 *
 * 1. O filtro de periodo compara a COLUNA CRUA com um instante calculado, em
 *    vez de converter a coluna com `AT TIME ZONE ... ::date`. Envolver a coluna
 *    em funcao impede o Postgres de usar o indice de `received_at`, e o filtro
 *    de periodo esta presente em praticamente toda consulta do painel. Assim a
 *    comparacao continua indexavel e o resultado no fuso da operacao e o mesmo.
 *
 * 2. Cada condicao entra entre parenteses. As condicoes sao unidas por AND,
 *    mas algumas contem OR ou AND internos; sem parenteses, incluir uma nova
 *    condicao com OR no futuro passaria a filtrar errado em silencio.
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

  /** Meia-noite local do dia informado, como instante absoluto. */
  const localMidnight = (placeholder: string, addDays = 0) =>
    `((${placeholder}::date + ${addDays})::timestamp AT TIME ZONE '${PANEL_TIMEZONE}')`;

  if (filters.startDate) {
    conditions.push(
      `(t.received_at >= ${localMidnight(push(filters.startDate))})`
    );
  }

  if (filters.endDate) {
    // Fim do dia = meia-noite do dia seguinte, exclusivo. Evita perder os
    // registros gravados depois de 23:59:59.
    conditions.push(
      `(t.received_at < ${localMidnight(push(filters.endDate), 1)})`
    );
  }

  if (filters.carrierCode) {
    conditions.push(`(c.code = ${push(filters.carrierCode)})`);
  }

  if (filters.status) {
    conditions.push(`(t.status = ${push(filters.status)})`);
  }

  if (filters.serviceType) {
    conditions.push(`(t.service_type = ${push(filters.serviceType)})`);
  }

  if (filters.shippingMode) {
    conditions.push(`(t.shipping_mode = ${push(filters.shippingMode)})`);
  }

  if (filters.assignedUserId === UNASSIGNED) {
    conditions.push(`(t.assigned_user_id IS NULL)`);
  } else if (filters.assignedUserId) {
    conditions.push(`(t.assigned_user_id = ${push(filters.assignedUserId)})`);
  }

  // Os recortes de prazo sao apresentados como opcoes de uma lista, entao
  // precisam significar exatamente o que dizem. "Vence hoje" exclui o que ja
  // passou: um prazo das 8h quando sao 15h e caso perdido, nao trabalho do dia.
  switch (filters.deadline) {
    case "overdue":
      conditions.push(
        `(t.shipping_deadline IS NOT NULL
          AND t.shipping_deadline < CURRENT_TIMESTAMP)`
      );
      break;
    case "today":
      conditions.push(
        `(t.shipping_deadline IS NOT NULL
          AND t.shipping_deadline >= CURRENT_TIMESTAMP
          AND (t.shipping_deadline AT TIME ZONE '${PANEL_TIMEZONE}')::date
              = (CURRENT_TIMESTAMP AT TIME ZONE '${PANEL_TIMEZONE}')::date)`
      );
      break;
    case "next_24h":
      conditions.push(
        `(t.shipping_deadline IS NOT NULL
          AND t.shipping_deadline >= CURRENT_TIMESTAMP
          AND t.shipping_deadline < CURRENT_TIMESTAMP + INTERVAL '24 hours')`
      );
      break;
    case "next_48h":
      conditions.push(
        `(t.shipping_deadline IS NOT NULL
          AND t.shipping_deadline >= CURRENT_TIMESTAMP
          AND t.shipping_deadline < CURRENT_TIMESTAMP + INTERVAL '48 hours')`
      );
      break;
    case "no_deadline":
      conditions.push(`(t.shipping_deadline IS NULL)`);
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
    conditions.push(`(t.assigned_user_id = ${push(currentUserId)})`);
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

/**
 * Une o WHERE construido com condicoes extras da consulta.
 * Evita o padrao `${clause} ${clause ? "AND" : "WHERE"}` repetido nas rotas,
 * que dependia de o chamador lembrar de olhar se a clausula estava vazia.
 */
export function mergeClause(
  clause: string,
  ...extraConditions: string[]
): string {
  const extras = extraConditions
    .map((condition) => condition.trim())
    .filter((condition) => condition.length > 0)
    .map((condition) => `(${condition})`);

  if (extras.length === 0) {
    return clause;
  }

  return clause
    ? `${clause} AND ${extras.join(" AND ")}`
    : `WHERE ${extras.join(" AND ")}`;
}
