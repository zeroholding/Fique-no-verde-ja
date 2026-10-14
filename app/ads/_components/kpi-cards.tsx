import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { formatIndicator, formatPercent, percentChange } from "@/lib/ads/format";
import { ADS_INDICATORS, type AdsIndicatorKey, type AdsIndicatorValues } from "@/lib/ads/metrics";

/**
 * Indicadores do topo do painel. Aparecem só os que o relatório permite
 * calcular, em ordem de importância para quem compra mídia: investimento,
 * resultado e custo do resultado, retorno, cliques, entrega.
 */

const MAX_CARDS = 8;

const OUTCOME_COST: Record<"results" | "conversations" | "leads" | "purchases", AdsIndicatorKey> = {
  results: "cost_per_result",
  conversations: "cost_per_conversation",
  leads: "cost_per_lead",
  purchases: "cost_per_purchase",
};

export function pickKpis(totals: AdsIndicatorValues): AdsIndicatorKey[] {
  const has = (key: AdsIndicatorKey) => totals[key] !== null;
  const keys: AdsIndicatorKey[] = ["spend"];

  // Um só resultado principal: "Resultados" já costuma ser a conversa ou o lead.
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
  const color =
    good === null
      ? "text-[var(--ads-ink-muted)]"
      : good
        ? "text-[var(--ads-positive)]"
        : "text-[var(--ads-negative)]";
  const Arrow = rounded >= 0 ? ArrowUpRight : ArrowDownRight;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";

  return (
    <p className="mt-1.5 flex items-center gap-1 text-[12.5px] text-[var(--ads-ink-muted)]">
      <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${color}`}>
        {rounded !== 0 ? <Arrow className="size-3.5" aria-hidden /> : null}
        {sign}
        {formatPercent(Math.abs(rounded), 1)}
      </span>
      <span>vs. período anterior</span>
    </p>
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
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicadores do período">
      {indicators.map((key) => {
        const definition = ADS_INDICATORS[key];
        return (
          <li key={key} className="rounded-lg border border-[var(--ads-line)] bg-white px-4 py-3.5">
            <p className="text-[13px] font-medium text-[var(--ads-ink-soft)]">{definition.label}</p>
            <p className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.01em] text-[var(--ads-ink)] tabular-nums sm:text-[24px]">
              {formatIndicator(totals[key], definition.format, currency)}
            </p>
            <ChangeLine indicator={key} current={totals[key]} previous={previous ? previous[key] : null} />
            {definition.hint ? (
              <p className="mt-1.5 text-[12px] leading-snug text-[var(--ads-ink-muted)]">{definition.hint}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
