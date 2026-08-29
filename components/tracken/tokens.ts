/**
 * Tokens visuais do painel Tracken.
 *
 * O Tailwind v4 monta as classes em tempo de build lendo o codigo-fonte, entao
 * classe dinamica montada por interpolacao (`bg-${cor}-500`) nao existe no CSS
 * final. Por isso as combinacoes ficam escritas por extenso aqui.
 */

export type TrackenColor =
  | "green"
  | "blue"
  | "amber"
  | "red"
  | "purple"
  | "slate";

const FALLBACK: TrackenColor = "slate";

const COLOR_KEYS: TrackenColor[] = [
  "green",
  "blue",
  "amber",
  "red",
  "purple",
  "slate",
];

export type { TrackenColor as TrackenColorName };

export function normalizeColor(value: string | null | undefined): TrackenColor {
  if (value && (COLOR_KEYS as string[]).includes(value)) {
    return value as TrackenColor;
  }
  return FALLBACK;
}

/** Badge de status e de transportadora: fundo claro, texto forte, borda suave. */
export const BADGE_CLASSES: Record<TrackenColor, string> = {
  green: "bg-green-50 text-green-700 border-green-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  slate: "bg-slate-100 text-slate-700 border-slate-200",
};

/** Ponto colorido usado nas legendas e nos badges. */
export const DOT_CLASSES: Record<TrackenColor, string> = {
  green: "bg-green-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  slate: "bg-slate-400",
};

/** Icone dos cartoes de KPI. */
export const KPI_ICON_CLASSES: Record<TrackenColor, string> = {
  green: "bg-green-100 text-green-600",
  blue: "bg-blue-100 text-blue-600",
  amber: "bg-amber-100 text-amber-600",
  red: "bg-red-100 text-red-600",
  purple: "bg-purple-100 text-purple-600",
  slate: "bg-slate-100 text-slate-600",
};

/** Barras horizontais do grafico "Atendimentos por Status". */
export const BAR_CLASSES: Record<TrackenColor, string> = {
  green: "bg-green-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  slate: "bg-slate-400",
};

/** Valores hexadecimais para o recharts, que nao aceita classe do Tailwind. */
export const CHART_HEX: Record<TrackenColor, string> = {
  green: "#22C55E",
  blue: "#3B82F6",
  amber: "#F59E0B",
  red: "#EF4444",
  purple: "#A855F7",
  slate: "#94A3B8",
};

/** Verde da marca, usado em acoes primarias e no gauge de SLA. */
export const BRAND_GREEN = "#16A34A";
