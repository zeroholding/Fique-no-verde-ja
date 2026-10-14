import type { AdsIndicatorValues, AdsMetricKey, AdsMetricValues } from "./metrics";

/** Contratos das APIs `/api/ads/*`, compartilhados entre rota e tela. */

export type AdsCoverage = { firstDay: string; lastDay: string };

export type AdsRankingLevel = "campaign" | "adset" | "ad";

export type AdsRankingRow = {
  key: string;
  /** Vazio quando o relatório não trouxe o nome. A tela mostra "Não informado". */
  name: string;
  campaign: string;
  adset: string;
  account: string;
  /** Dias com veiculação no período. */
  days: number;
  /** Fatia do investimento do período (0 a 1). */
  spendShare: number | null;
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
  /** Existe relatório cobrindo o dia. Fora disso o gráfico mostra lacuna, não zero. */
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
  /** Dias do período sem nenhum relatório enviado. */
  missingDays: number;
  missingRanges: { from: string; to: string }[];
  rankings: AdsRanking[];
  accounts: string[];
  resultTypes: string[];
  currency: string;
  currencies: string[];
  lastImport: { createdAt: string; fileName: string } | null;
};

export type AdsImportStatus = "in_use" | "partial" | "replaced";

export type AdsImportItem = {
  id: string;
  fileName: string;
  fileSize: number;
  format: string;
  firstDay: string;
  lastDay: string;
  accounts: string[];
  rowsImported: number;
  rowsInUse: number;
  rowsReplaced: number;
  metrics: AdsMetricKey[];
  status: AdsImportStatus;
  uploadedBy: string;
  createdAt: string;
};

export type AdsImportsResponse = {
  imports: AdsImportItem[];
  canManage: boolean;
};

export type AdsImportPreview = {
  fileName: string;
  fileSize: number;
  format: "csv" | "xlsx";
  firstDay: string;
  lastDay: string;
  days: number;
  rowsRead: number;
  rowsToSave: number;
  rowsIgnored: number;
  accounts: string[];
  counts: { campaigns: number; adsets: number; ads: number };
  metrics: AdsMetricKey[];
  /** Métricas importantes que não vieram, para orientar a próxima exportação. */
  missing: AdsMetricKey[];
  ignoredColumns: string[];
  currency: string | null;
  totals: AdsMetricValues;
  replacement: {
    rows: number;
    totals: AdsMetricValues;
    imports: { fileName: string; createdAt: string }[];
  };
  sameFile: { fileName: string; createdAt: string } | null;
  warnings: string[];
};

export type AdsImportSaved = {
  id: string;
  rowsImported: number;
  rowsReplaced: number;
  firstDay: string;
  lastDay: string;
};
