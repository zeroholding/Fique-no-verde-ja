import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  DollarSign,
  Eye,
  Globe,
  Layers,
  MessageSquare,
  MousePointer,
  MousePointerClick,
  Percent,
  Scale,
  ShoppingBag,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { formatIndicator, formatPercent, percentChange } from "@/lib/ads/format";
import { ADS_INDICATORS, type AdsIndicatorKey, type AdsIndicatorValues } from "@/lib/ads/metrics";

/**
 * Indicadores do topo do painel. Visual clean, de alta densidade e legibilidade,
 * com ícones SVG funcionais e tipografia Montserrat.
 */

const MAX_CARDS = 8;

const OUTCOME_COST: Record<"results" | "conversations" | "leads" | "purchases", AdsIndicatorKey> = {
  results: "cost_per_result",
  conversations: "cost_per_conversation",
  leads: "cost_per_lead",
  purchases: "cost_per_purchase",
};

const METRIC_ICONS: Record<AdsIndicatorKey, { icon: LucideIcon; bg: string; fg: string }> = {
  spend: { icon: DollarSign, bg: "bg-blue-50 border-blue-100", fg: "text-blue-600" },
  results: { icon: Target, bg: "bg-indigo-50 border-indigo-100", fg: "text-indigo-600" },
  cost_per_result: { icon: Scale, bg: "bg-amber-50 border-amber-100", fg: "text-amber-600" },
  conversations: { icon: MessageSquare, bg: "bg-sky-50 border-sky-100", fg: "text-sky-600" },
  cost_per_conversation: { icon: Coins, bg: "bg-amber-50 border-amber-100", fg: "text-amber-600" },
  leads: { icon: UserCheck, bg: "bg-violet-50 border-violet-100", fg: "text-violet-600" },
  cost_per_lead: { icon: Coins, bg: "bg-orange-50 border-orange-100", fg: "text-orange-600" },
  purchases: { icon: ShoppingBag, bg: "bg-emerald-50 border-emerald-100", fg: "text-emerald-600" },
  cost_per_purchase: { icon: Coins, bg: "bg-rose-50 border-rose-100", fg: "text-rose-600" },
  purchase_value: { icon: DollarSign, bg: "bg-emerald-50 border-emerald-100", fg: "text-emerald-600" },
  roas: { icon: TrendingUp, bg: "bg-emerald-50 border-emerald-100", fg: "text-emerald-600" },
  link_clicks: { icon: MousePointerClick, bg: "bg-blue-50 border-blue-100", fg: "text-blue-600" },
  cpc: { icon: Coins, bg: "bg-teal-50 border-teal-100", fg: "text-teal-600" },
  ctr: { icon: Percent, bg: "bg-indigo-50 border-indigo-100", fg: "text-indigo-600" },
  all_clicks: { icon: MousePointer, bg: "bg-slate-50 border-slate-200", fg: "text-slate-600" },
  landing_page_views: { icon: Globe, bg: "bg-purple-50 border-purple-100", fg: "text-purple-600" },
  impressions: { icon: Eye, bg: "bg-slate-100/80 border-slate-200", fg: "text-slate-600" },
  cpm: { icon: Layers, bg: "bg-purple-50 border-purple-100", fg: "text-purple-600" },
  reach_per_day: { icon: Users, bg: "bg-teal-50 border-teal-100", fg: "text-teal-600" },
};

export function pickKpis(totals: AdsIndicatorValues): AdsIndicatorKey[] {
  const has = (key: AdsIndicatorKey) => totals[key] !== null;
  const keys: AdsIndicatorKey[] = ["spend"];

  const outcome = (["results", "conversations", "leads", "purchases"] as const).find(has);
  if (outcome) keys.push(outcome, OUTCOME_COST[outcome]);
  if (has("purchase_value")) keys.push("purchase_value", "roas");
  keys.push("link_clicks", "cpc", "ctr", "impressions", "cpm", "reach_per_day");

  return Array.from(new Set(keys.filter(has))).slice(0, MAX_CARDS);
}

function ChangeLine({
  indicator,
  current,
  previous,
}: {
  indicator: AdsIndicatorKey;
  current: number | null;
  previous: number | null;
}) {
  const change = percentChange(current, previous);
  if (change === null) return null;

  const better = ADS_INDICATORS[indicator].better;
  const rounded = Math.abs(change) < 0.05 ? 0 : change;
  const good = better === "neutral" || rounded === 0 ? null : (rounded > 0) === (better === "higher");
  
  const badgeStyle =
    good === null
      ? "bg-slate-100/90 text-slate-600 border-slate-200"
      : good
        ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
        : "bg-rose-50 text-rose-700 border-rose-200/80";

  const Arrow = rounded >= 0 ? ArrowUpRight : ArrowDownRight;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";

  return (
    <div className="mt-2.5 flex items-center gap-1.5 text-[12px] text-slate-500">
      <span className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-bold tabular-nums text-[11px] ${badgeStyle}`}>
        {rounded !== 0 ? <Arrow className="size-3" aria-hidden /> : null}
        {sign}
        {formatPercent(Math.abs(rounded), 1)}
      </span>
      <span className="text-[11.5px] font-medium text-slate-400">vs. período anterior</span>
    </div>
  );
}

export function KpiCards({
  indicators,
  totals,
  previous,
  currency,
}: {
  indicators: AdsIndicatorKey[];
  totals: AdsIndicatorValues;
  previous: AdsIndicatorValues | null;
  currency: string;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3.5 lg:grid-cols-4" aria-label="Indicadores do período">
      {indicators.map((key) => {
        const definition = ADS_INDICATORS[key];
        const iconMeta = METRIC_ICONS[key] ?? { icon: DollarSign, bg: "bg-slate-50 border-slate-200", fg: "text-slate-600" };
        const Icon = iconMeta.icon;

        return (
          <li
            key={key}
            className="group relative flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 hover:shadow-md hover:border-slate-300"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12.5px] font-bold uppercase tracking-wider text-slate-500 truncate">
                  {definition.label}
                </p>
                <span className={`grid size-7.5 shrink-0 place-items-center rounded-lg border ${iconMeta.bg} ${iconMeta.fg}`}>
                  <Icon className="size-4" aria-hidden />
                </span>
              </div>

              <p className="mt-2 text-[23px] font-extrabold tracking-tight text-slate-900 tabular-nums sm:text-[25px]">
                {formatIndicator(totals[key], definition.format, currency)}
              </p>
            </div>

            <div>
              <ChangeLine indicator={key} current={totals[key]} previous={previous ? previous[key] : null} />
              {definition.hint ? (
                <p className="mt-2 text-[11.5px] leading-tight text-slate-400 font-medium">{definition.hint}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
