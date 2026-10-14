/**
 * Catálogo de métricas do /ads: o que vem do relatório do Meta e o que o painel
 * calcula a partir disso. Compartilhado entre servidor e tela.
 *
 * Regra central: métrica calculada só usa linhas que trazem as duas pontas da
 * conta. Se um relatório antigo não tinha cliques, o investimento dele não entra
 * no custo por clique. Sem isso o CPC ficaria inflado por gasto sem clique
 * registrado.
 */

/** Métricas brutas. Os nomes são os mesmos das colunas de `ads_daily`. */
export const ADS_METRIC_KEYS = [
  "spend",
  "impressions",
  "reach",
  "link_clicks",
  "all_clicks",
  "results",
  "landing_page_views",
  "conversations",
  "leads",
  "purchases",
  "purchase_value",
] as const;

export type AdsMetricKey = (typeof ADS_METRIC_KEYS)[number];

export type AdsMetricValues = Record<AdsMetricKey, number | null>;

export const ADS_METRIC_LABELS: Record<AdsMetricKey, string> = {
  spend: "Investimento",
  impressions: "Impressões",
  reach: "Alcance",
  link_clicks: "Cliques no link",
  all_clicks: "Cliques (todos)",
  results: "Resultados",
  landing_page_views: "Visualizações da página de destino",
  conversations: "Conversas iniciadas",
  leads: "Leads",
  purchases: "Compras",
  purchase_value: "Valor das compras",
};

/** Métricas que o Meta sempre entrega como número inteiro. */
export const ADS_INTEGER_METRICS: ReadonlySet<AdsMetricKey> = new Set<AdsMetricKey>([
  "impressions",
  "reach",
  "link_clicks",
  "all_clicks",
  "landing_page_views",
]);

/**
 * Pares numerador/denominador das métricas calculadas. Cada par é somado só
 * nas linhas em que os dois valores existem.
 */
export const ADS_RATIO_PAIRS = [
  ["link_clicks", "impressions"],
  ["spend", "link_clicks"],
  ["spend", "impressions"],
  ["spend", "results"],
  ["spend", "conversations"],
  ["spend", "leads"],
  ["spend", "purchases"],
  ["purchase_value", "spend"],
] as const satisfies ReadonlyArray<readonly [AdsMetricKey, AdsMetricKey]>;

export type AdsRatioPair = (typeof ADS_RATIO_PAIRS)[number];

export function ratioPairKey(pair: readonly [AdsMetricKey, AdsMetricKey]): string {
  return `${pair[0]}__${pair[1]}`;
}

/** Somas de um recorte (período, dia, campanha...). */
export type AdsAggregate = {
  rows: number;
  days: number;
  /** Dias distintos com alcance informado, para a média diária. */
  reachDays: number;
  sums: AdsMetricValues;
  pairs: Record<string, { numerator: number; denominator: number } | null>;
};

export const ADS_INDICATOR_KEYS = [
  "spend",
  "results",
  "cost_per_result",
  "conversations",
  "cost_per_conversation",
  "leads",
  "cost_per_lead",
  "purchases",
  "cost_per_purchase",
  "purchase_value",
  "roas",
  "link_clicks",
  "cpc",
  "ctr",
  "all_clicks",
  "landing_page_views",
  "impressions",
  "cpm",
  "reach_per_day",
] as const;

export type AdsIndicatorKey = (typeof ADS_INDICATOR_KEYS)[number];

export type AdsIndicatorValues = Record<AdsIndicatorKey, number | null>;

export type AdsIndicatorFormat = "money" | "count" | "percent" | "ratio";

export type AdsIndicatorDef = {
  label: string;
  /** Rótulo curto, para cabeçalho de tabela. */
  short: string;
  format: AdsIndicatorFormat;
  /** Para onde a variação é boa. Investimento é neutro: gastar mais não é bom nem ruim. */
  better: "higher" | "lower" | "neutral";
  /** Quantidades viram barras no gráfico; taxas e custos viram linha. */
  chart: "bar" | "line";
  hint?: string;
};

export const ADS_INDICATORS: Record<AdsIndicatorKey, AdsIndicatorDef> = {
  spend: { label: "Investimento", short: "Investimento", format: "money", better: "neutral", chart: "bar" },
  results: { label: "Resultados", short: "Resultados", format: "count", better: "higher", chart: "bar" },
  cost_per_result: {
    label: "Custo por resultado",
    short: "Custo/resultado",
    format: "money",
    better: "lower",
    chart: "line",
  },
  conversations: {
    label: "Conversas iniciadas",
    short: "Conversas",
    format: "count",
    better: "higher",
    chart: "bar",
  },
  cost_per_conversation: {
    label: "Custo por conversa",
    short: "Custo/conversa",
    format: "money",
    better: "lower",
    chart: "line",
  },
  leads: { label: "Leads", short: "Leads", format: "count", better: "higher", chart: "bar" },
  cost_per_lead: {
    label: "Custo por lead (CPL)",
    short: "CPL",
    format: "money",
    better: "lower",
    chart: "line",
  },
  purchases: { label: "Compras", short: "Compras", format: "count", better: "higher", chart: "bar" },
  cost_per_purchase: {
    label: "Custo por compra",
    short: "Custo/compra",
    format: "money",
    better: "lower",
    chart: "line",
  },
  purchase_value: {
    label: "Valor das compras",
    short: "Valor compras",
    format: "money",
    better: "higher",
    chart: "bar",
  },
  roas: {
    label: "Retorno sobre investimento (ROAS)",
    short: "ROAS",
    format: "ratio",
    better: "higher",
    chart: "line",
    hint: "Valor das compras dividido pelo investimento.",
  },
  link_clicks: {
    label: "Cliques no link",
    short: "Cliques",
    format: "count",
    better: "higher",
    chart: "bar",
  },
  cpc: {
    label: "Custo por clique (CPC)",
    short: "CPC",
    format: "money",
    better: "lower",
    chart: "line",
  },
  ctr: {
    label: "Taxa de cliques (CTR)",
    short: "CTR",
    format: "percent",
    better: "higher",
    chart: "line",
    hint: "Cliques no link a cada 100 impressões.",
  },
  all_clicks: {
    label: "Cliques (todos)",
    short: "Cliques (todos)",
    format: "count",
    better: "higher",
    chart: "bar",
  },
  landing_page_views: {
    label: "Visualizações da página de destino",
    short: "Visualizações",
    format: "count",
    better: "higher",
    chart: "bar",
  },
  impressions: {
    label: "Impressões",
    short: "Impressões",
    format: "count",
    better: "higher",
    chart: "bar",
  },
  cpm: {
    label: "Custo por mil impressões (CPM)",
    short: "CPM",
    format: "money",
    better: "lower",
    chart: "line",
  },
  reach_per_day: {
    label: "Alcance médio por dia",
    short: "Alcance/dia",
    format: "count",
    better: "higher",
    chart: "bar",
    hint: "Média dos dias com anúncio no ar. A mesma pessoa pode contar em mais de um dia.",
  },
};

function ratio(aggregate: AdsAggregate, pair: AdsRatioPair, factor = 1): number | null {
  const sums = aggregate.pairs[ratioPairKey(pair)];
  if (!sums || !(sums.denominator > 0)) return null;
  return (sums.numerator / sums.denominator) * factor;
}

/** Indicadores de um recorte. Divisão por zero vira "indisponível", nunca zero ou infinito. */
export function computeIndicators(aggregate: AdsAggregate): AdsIndicatorValues {
  const sums = aggregate.sums;
  const [ctr, cpc, cpm, perResult, perConversation, perLead, perPurchase, roas] = ADS_RATIO_PAIRS;

  return {
    spend: sums.spend,
    results: sums.results,
    cost_per_result: ratio(aggregate, perResult),
    conversations: sums.conversations,
    cost_per_conversation: ratio(aggregate, perConversation),
    leads: sums.leads,
    cost_per_lead: ratio(aggregate, perLead),
    purchases: sums.purchases,
    cost_per_purchase: ratio(aggregate, perPurchase),
    purchase_value: sums.purchase_value,
    roas: ratio(aggregate, roas),
    link_clicks: sums.link_clicks,
    cpc: ratio(aggregate, cpc),
    ctr: ratio(aggregate, ctr, 100),
    all_clicks: sums.all_clicks,
    landing_page_views: sums.landing_page_views,
    impressions: sums.impressions,
    cpm: ratio(aggregate, cpm, 1000),
    reach_per_day:
      sums.reach !== null && aggregate.reachDays > 0 ? sums.reach / aggregate.reachDays : null,
  };
}

export function emptyMetricValues(): AdsMetricValues {
  const values = {} as AdsMetricValues;
  for (const key of ADS_METRIC_KEYS) values[key] = null;
  return values;
}
