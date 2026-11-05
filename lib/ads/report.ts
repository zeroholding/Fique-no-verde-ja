import type { AdsMetricKey, AdsMetricValues } from "./metrics";

/**
 * O que a sincronização entrega ao gravador.
 *
 * O módulo passou a ter uma única porta de entrada (a Meta Marketing API). Estes
 * tipos continuam existindo porque separam "linha lida" de "linha gravada": a
 * coleta monta `AdsReportRow`, o banco recebe as colunas de `ads_daily`.
 */

export type AdsReportRow = {
  day: string;
  accountId: string;
  accountName: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  resultType: string;
  /** `null` quando a métrica não veio na resposta da Meta. */
  metrics: AdsMetricValues;
};

export type ParsedAdsReport = {
  rows: AdsReportRow[];
  columns: { header: string; usedAs: string | null }[];
  /** Métricas presentes no lote. */
  metrics: AdsMetricKey[];
  levels: { account: boolean; campaign: boolean; adset: boolean; ad: boolean };
  firstDay: string;
  lastDay: string;
  /** Primeiro e último dia que a sincronização pediu (pode ser maior que os dias com dado). */
  requestedFirstDay: string;
  requestedLastDay: string;
  days: number;
  accountIds: string[];
  accountNames: string[];
  /** Nome de exibição de cada conta (nome, ou o ID quando não há nome). */
  accounts: string[];
  counts: { campaigns: number; adsets: number; ads: number };
  currency: string | null;
  totals: AdsMetricValues;
  rowsRead: number;
  rowsIgnored: number;
  rowsMerged: number;
  warnings: string[];
};

/** Criativo de um anúncio, para a tela mostrar a imagem. */
export type AdCreative = {
  adId: string;
  title: string;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  objectType: string;
};
