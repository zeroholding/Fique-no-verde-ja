/**
 * Datas do /ads. Um dia é sempre o texto `YYYY-MM-DD`, sem hora nem fuso: o
 * relatório do Meta já vem por dia da conta de anúncios. Toda conta é feita em
 * UTC para que o fuso do servidor ou do navegador não mude o dia.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
const OPERATION_TIMEZONE = "America/Sao_Paulo";

/** Maior período aceito numa consulta do painel (cerca de 5 anos). */
export const ADS_MAX_RANGE_DAYS = 1830;

const pad = (value: number) => String(value).padStart(2, "0");

export function isIsoDay(value: string): boolean {
  const match = ISO_DAY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function dayToUtcMs(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}

function utcMsToDay(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(day: string, amount: number): string {
  return utcMsToDay(dayToUtcMs(day) + amount * DAY_MS);
}

/** Dias entre `start` e `end` (0 quando são o mesmo dia). */
export function daysBetween(start: string, end: string): number {
  return Math.round((dayToUtcMs(end) - dayToUtcMs(start)) / DAY_MS);
}

export function maxDay(left: string, right: string): string {
  return left > right ? left : right;
}

export function minDay(left: string, right: string): string {
  return left < right ? left : right;
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 8)}01`;
}

/** Hoje no fuso da operação. */
export function todayInSaoPaulo(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export type AdsDayRange = { from: string; to: string };

export type AdsPeriodPreset =
  | "7d"
  | "30d"
  | "90d"
  | "this_month"
  | "last_month"
  | "all"
  | "custom";

export const ADS_PERIOD_PRESETS: ReadonlyArray<{ value: AdsPeriodPreset; label: string }> = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "this_month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
  { value: "all", label: "Todo o período" },
  { value: "custom", label: "Personalizado" },
];

/**
 * Período de um atalho.
 *
 * "Últimos N dias" conta para trás a partir do último dia com dados, e não de
 * hoje: o relatório chega depois que os dias acontecem, e contar de hoje
 * mostraria dias vazios que só querem dizer "ainda não enviado". Os meses
 * seguem o calendário.
 */
export function resolvePresetRange(
  preset: Exclude<AdsPeriodPreset, "custom">,
  coverage: { firstDay: string; lastDay: string },
  today: string
): AdsDayRange {
  switch (preset) {
    case "7d":
    case "30d":
    case "90d": {
      const size = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
      return {
        from: maxDay(coverage.firstDay, addDays(coverage.lastDay, -(size - 1))),
        to: coverage.lastDay,
      };
    }
    case "this_month":
      return { from: startOfMonth(today), to: today };
    case "last_month": {
      const lastMonthEnd = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(lastMonthEnd), to: lastMonthEnd };
    }
    case "all":
      return { from: coverage.firstDay, to: coverage.lastDay };
  }
}
