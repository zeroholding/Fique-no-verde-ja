/**
 * Formatacao para o painel Tracken.
 * Toda data e apresentada no fuso da operacao (America/Sao_Paulo).
 */

const OPERATION_TIMEZONE = "America/Sao_Paulo";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: OPERATION_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: OPERATION_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: OPERATION_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
});

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return dateFormatter.format(date);
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return timeFormatter.format(date);
}

export function formatShortDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return shortDateFormatter.format(date);
}

/** Data no formato `YYYY-MM-DD` no fuso da operacao, para inputs e filtros. */
export function toInputDate(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const lookup = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${lookup("year")}-${lookup("month")}-${lookup("day")}`;
}

export type DeadlineUrgency = "overdue" | "critical" | "warning" | "normal";

/**
 * Urgencia do limite de envio.
 *
 * Depois do limite o atraso ja foi contabilizado pelo Mercado Livre, entao o
 * painel destaca a proximidade com intensidade crescente.
 */
export function getDeadlineUrgency(
  deadline: string | null | undefined
): DeadlineUrgency {
  if (!deadline) return "normal";

  const target = new Date(deadline).getTime();
  if (Number.isNaN(target)) return "normal";

  const hoursLeft = (target - Date.now()) / 3_600_000;

  if (hoursLeft < 0) return "overdue";
  if (hoursLeft <= 12) return "critical";
  if (hoursLeft <= 36) return "warning";
  return "normal";
}

/** Texto curto do tempo restante ate o limite de envio. */
export function formatTimeLeft(
  deadline: string | null | undefined
): string | null {
  if (!deadline) return null;

  const target = new Date(deadline).getTime();
  if (Number.isNaN(target)) return null;

  const diffMinutes = Math.round((target - Date.now()) / 60_000);
  const absMinutes = Math.abs(diffMinutes);
  const suffix = diffMinutes < 0 ? "atras" : "restantes";

  if (absMinutes < 60) {
    return `${absMinutes} min ${suffix}`;
  }

  const hours = Math.floor(absMinutes / 60);
  if (hours < 48) {
    return `${hours}h ${suffix}`;
  }

  return `${Math.floor(hours / 24)}d ${suffix}`;
}

/**
 * Tamanho do atraso: quanto tempo passou do limite de envio.
 *
 * A operacao cobra "quanto atrasou", nao "quando saiu". Um envio postado dois
 * dias depois do limite e um caso diferente de um postado vinte minutos
 * depois, e a data crua nao diz isso sem quem le fazer a conta na cabeca.
 *
 * `reference` e o instante com que o limite e comparado: a data real do envio
 * quando ja saiu, ou agora quando ainda nao saiu (atraso em curso).
 *
 * Devolve null quando nao houve atraso ou quando falta uma das duas datas --
 * assim quem chama decide o que mostrar, em vez de receber "0h".
 */
export function formatLateness(
  deadline: string | null | undefined,
  reference: string | Date | null | undefined
): string | null {
  if (!deadline || !reference) return null;

  const limit = new Date(deadline).getTime();
  const actual = (
    reference instanceof Date ? reference : new Date(reference)
  ).getTime();
  if (Number.isNaN(limit) || Number.isNaN(actual)) return null;

  const minutes = Math.floor((actual - limit) / 60_000);
  if (minutes <= 0) return null;

  // No maximo duas unidades. "2d 5h" e legivel numa celula de tabela;
  // "2d 5h 13min" nao.
  if (minutes < 60) return `${minutes}min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const restMinutes = minutes % 60;
    return restMinutes > 0 ? `${hours}h ${restMinutes}min` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  atraso: "Atraso",
  reclamacao: "Reclamacao",
  cancelado: "Cancelado",
};
