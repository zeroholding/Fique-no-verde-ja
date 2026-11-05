import type { AdsIndicatorValues } from "./metrics";
import type { AdCreative } from "./report";

export type { AdCreativeFormat } from "./report";

/** Contratos das APIs `/api/ads/*`, compartilhados entre rota e tela. */

export type AdsCoverage = { firstDay: string; lastDay: string };

export type AdsRankingLevel = "campaign" | "adset" | "ad";

/** Peça visual de um anúncio, como a tela precisa dela. */
export type AdsCreative = AdCreative;

/** Um anúncio no catálogo da galeria: a peça + os números do período. */
export type AdsCreativeItem = {
  adId: string;
  name: string;
  campaignName: string;
  campaignId: string;
  adsetName: string;
  days: number;
  /** `null` quando a Meta não devolveu a peça (permissão ou criativo apagado). */
  creative: AdsCreative | null;
  values: AdsIndicatorValues;
};

/** Opção de campanha para o filtro. */
export type AdsCampaignOption = { id: string; name: string; spend: number | null };

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
  /** Peça visual do anúncio. Só no nível de anúncio. */
  creative: AdsCreative | null;
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
  /** Período realmente analisado (é o dia de hoje quando o atalho "Hoje" está ligado). */
  range: { from: string; to: string; days: number };
  /** Período escolhido no seletor, mesmo com "Hoje" ligado — é o que os filtros usam. */
  baseRange: { from: string; to: string; days: number };
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
  /** Anúncios com a peça visual, para a galeria. */
  creatives: AdsCreativeItem[];
  /** Quantos anúncios existem em cada aba de situação (all, active, paused, archived). */
  creativeCounts: Record<string, number>;
  /** Campanhas do período, para o filtro. */
  campaigns: AdsCampaignOption[];
  /** Recorte aplicado, devolvido para a tela marcar os filtros ativos. */
  filters: {
    status: string | null;
    campaignId: string | null;
    search: string | null;
    onlyToday: boolean;
  };
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
