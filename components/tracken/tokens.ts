/**
 * Tokens visuais do painel Tracken.
 *
 * O Tailwind v4 monta as classes em tempo de build lendo o codigo-fonte, entao
 * classe dinamica montada por interpolacao (`bg-${cor}-500`) nao existe no CSS
 * final. Por isso as combinacoes ficam escritas por extenso aqui.
 */

import { Ban, CheckCircle2, Clock, Inbox, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

/**
 * Icone monocromatico sobre fundo claro (KPI, tile, legenda).
 *
 * Existia copiado em KpiCard (ICON_TINT) e em PageShell (o `tint` do StatTile),
 * identicos. Duas copias do mesmo mapa divergem na primeira vez que alguem
 * ajusta um tom em uma das telas.
 */
export const TINT_CLASSES: Record<TrackenColor, string> = {
  green: "text-green-600",
  blue: "text-blue-600",
  amber: "text-amber-600",
  red: "text-red-600",
  purple: "text-purple-600",
  slate: "text-slate-400",
};

/**
 * Preenchimento cheio: barra, trilha de cartao e ponto de legenda usam o mesmo.
 *
 * Era o mesmo mapa escrito quatro vezes (BAR_CLASSES aqui, RAIL no KpiCard,
 * `bar` no ProgressRow e CARRIER_ACCENT no Badges). Fica um so, e este alias
 * existe para as chamadas antigas continuarem lendo bem no lugar onde estao.
 */
export const BAR_CLASSES = DOT_CLASSES;

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

/**
 * Icone de cada status.
 *
 * Estava duplicado, identico, no painel e em Relatorios. Duas copias do mesmo
 * mapa divergem na primeira vez que um status novo entra: uma tela ganha o
 * icone e a outra cai no fallback sem ninguem perceber.
 *
 * O fallback existe porque o mapa de status vive no banco
 * (`tracken_status_map`): um status criado por lá nao tem icone aqui, e a tela
 * precisa continuar renderizando.
 */
export const STATUS_ICONS: Record<string, LucideIcon> = {
  recepcionado: Inbox,
  em_atendimento: Clock,
  removido: CheckCircle2,
  negado: XCircle,
  cancelado: Ban,
};

export const STATUS_ICON_FALLBACK: LucideIcon = Inbox;

export function statusIcon(code: string | null | undefined): LucideIcon {
  if (!code) return STATUS_ICON_FALLBACK;
  return STATUS_ICONS[code] ?? STATUS_ICON_FALLBACK;
}
