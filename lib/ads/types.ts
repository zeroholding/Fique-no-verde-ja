import type { AdsIndicatorValues } from "./metrics";

/** Contratos das APIs `/api/ads/*`, compartilhados entre rota e tela. */

export type AdsCoverage = { firstDay: string; lastDay: string };

export type AdsRankingLevel = "campaign" | "adset" | "ad";

export type AdsRankingRow = {
  key: string;
  /** Vazio quando o nome não veio. A tela mostra "Não informado". */
  name: string;
  campaign: string;
  adset: string;
  account: string;
  /** Dias com veiculação no período. */
  days: number;
  /** Fatia do investimento do período (0 a 1). */
  spendShare: number | null;
  /** Imagem do anúncio. Só no nível de anúncio; nulo quando a Meta não devolveu. */
  thumbnailUrl: string | null;
  imageUrl: string | null;
  values: AdsIndicatorValues;
};

export type AdsRanking = {
  level: AdsRankingLevel;
  rows: AdsRankingRow[];
  /** A lista foi cortada no limite de linhas. */
  truncated: boolean;
};

export type AdsDailyPoint = {
  day: string;
  /** Existe cobertura para o dia. Fora disso o gráfico mostra lacuna, não zero. */
  covered: boolean;
  values: AdsIndicatorValues;
};

export type AdsDashboardData = {
  hasData: boolean;
  coverage: AdsCoverage | null;
  range: { from: string; to: string; days: number };
  previousRange: { from: string; to: string } | null;
  totals: AdsIndicatorValues;
  /** Período anterior de mesmo tamanho; `null` quando não há dados nele. */
  previous: AdsIndicatorValues | null;
  rowsInRange: number;
  daily: AdsDailyPoint[];
  /** Dias do período sem nenhuma cobertura. */
  missingDays: number;
  missingRanges: { from: string; to: string }[];
  rankings: AdsRanking[];
  accounts: string[];
  resultTypes: string[];
  currency: string;
  currencies: string[];
  lastImport: { createdAt: string; fileName: string } | null;
};

export type AdsImportSaved = {
  id: string;
  rowsImported: number;
  rowsReplaced: number;
  firstDay: string;
  lastDay: string;
};

export type AdsSyncResult = {
  success: boolean;
  saved: AdsImportSaved;
  accountName: string;
  message: string;
  creatives: number;
};
