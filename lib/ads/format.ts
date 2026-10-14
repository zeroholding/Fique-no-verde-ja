import type { AdsIndicatorFormat } from "./metrics";

/**
 * Formatação da tela do /ads, sempre em português do Brasil. Valor ausente
 * aparece como "—", nunca como zero.
 */

const EMPTY = "—";
const formatters = new Map<string, Intl.NumberFormat>();

function numberFormat(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("pt-BR", options);
    formatters.set(key, formatter);
  }
  return formatter;
}

const isNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

function moneyFormat(currency: string, compact: boolean): Intl.NumberFormat {
  const options: Intl.NumberFormatOptions = compact
    ? { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }
    : { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
  try {
    return numberFormat(`money:${currency}:${compact}`, options);
  } catch {
    // Código de moeda desconhecido: cai para real em vez de quebrar a tela.
    return numberFormat(`money:BRL:${compact}`, { ...options, currency: "BRL" });
  }
}

export function formatMoney(
  value: number | null | undefined,
  currency = "BRL",
  compact = false
): string {
  return isNumber(value) ? moneyFormat(currency, compact).format(value) : EMPTY;
}

export function formatCount(value: number | null | undefined, compact = false): string {
  if (!isNumber(value)) return EMPTY;
  return compact
    ? numberFormat("count:compact", { notation: "compact", maximumFractionDigits: 1 }).format(value)
    : numberFormat("count", { maximumFractionDigits: 0 }).format(value);
}

/** Recebe o valor já em porcentagem (2.5 = 2,5%). */
export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (!isNumber(value)) return EMPTY;
  const formatter = numberFormat(`percent:${digits}`, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${formatter.format(value)}%`;
}

export function formatRatio(value: number | null | undefined): string {
  if (!isNumber(value)) return EMPTY;
  return `${numberFormat("ratio", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}x`;
}

export function formatIndicator(
  value: number | null | undefined,
  format: AdsIndicatorFormat,
  currency: string,
  compact = false
): string {
  switch (format) {
    case "money":
      return formatMoney(value, currency, compact);
    case "count":
      return formatCount(value, compact);
    case "percent":
      return formatPercent(value, compact ? 1 : 2);
    case "ratio":
      return formatRatio(value);
  }
}

/** "2026-07-03" -> "03/07/2026", sem passar por Date (evita trocar o dia pelo fuso). */
export function formatDay(day: string): string {
  const [year, month, date] = day.split("-");
  return year && month && date ? `${date}/${month}/${year}` : EMPTY;
}

export function formatShortDay(day: string): string {
  const [, month, date] = day.split("-");
  return month && date ? `${date}/${month}` : EMPTY;
}

export function formatDayRange(from: string, to: string): string {
  if (from === to) return formatDay(from);
  if (from.slice(0, 4) === to.slice(0, 4)) return `${formatShortDay(from)} a ${formatDay(to)}`;
  return `${formatDay(from)} a ${formatDay(to)}`;
}

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Data e hora de um envio, no fuso da operação: "13/10/2026 às 21:50". */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY;
  const parts = dateTimeFormat.formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")}/${part("month")}/${part("year")} às ${part("hour")}:${part("minute")}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${numberFormat("size", { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}

/** Variação percentual. Sem base de comparação (ou base zero), não há variação. */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (!isNumber(current) || !isNumber(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}
