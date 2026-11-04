import { createHash } from "node:crypto";
import { addDays, isIsoDay, todayInSaoPaulo } from "./dates";
import { withAdsTransaction } from "./db";
import { formatDayRange, pluralize } from "./format";
import { ADS_METRIC_KEYS, type AdsMetricKey, type AdsMetricValues } from "./metrics";
import type { AdsReportRow, ParsedAdsReport } from "./report-rows";
import { saveImport } from "./store";
import type { AdsImportSaved } from "./types";

/**
 * Cliente da Meta Marketing API para sincronização automática de métricas de anúncios.
 * Lê credenciais configuradas nas variáveis de ambiente:
 * - META_ACCESS_TOKEN
 * - META_AD_ACCOUNT_ID
 * - META_API_VERSION (opcional, padrão 'v21.0')
 */

export type MetaConfigStatus = {
  isConfigured: boolean;
  adAccountId: string | null;
  apiVersion: string;
  missing: string[];
};

export function getMetaConfigStatus(): MetaConfigStatus {
  const missing: string[] = [];
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();
  const rawAccountId = process.env.META_AD_ACCOUNT_ID?.trim();
  const apiVersion = process.env.META_API_VERSION?.trim() || "v21.0";

  if (!accessToken) missing.push("META_ACCESS_TOKEN");
  if (!rawAccountId) missing.push("META_AD_ACCOUNT_ID");

  const cleanAccountId = rawAccountId ? rawAccountId.replace(/^act_/i, "") : null;

  return {
    isConfigured: missing.length === 0,
    adAccountId: cleanAccountId,
    apiVersion,
    missing,
  };
}

type MetaInsightItem = {
  date_start: string;
  date_stop: string;
  account_id?: string;
  account_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
};

type MetaInsightsResponse = {
  data: MetaInsightItem[];
  paging?: {
    cursors?: { before: string; after: string };
    next?: string;
  };
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

function emptyMetricValues(): AdsMetricValues {
  return {
    spend: null,
    impressions: null,
    reach: null,
    link_clicks: null,
    all_clicks: null,
    results: null,
    landing_page_views: null,
    conversations: null,
    leads: null,
    purchases: null,
    purchase_value: null,
  };
}

export async function fetchMetaInsights(params: {
  since?: string;
  until?: string;
}): Promise<{
  report: ParsedAdsReport;
  rawPayload: string;
  accountName: string;
}> {
  const status = getMetaConfigStatus();
  if (!status.isConfigured || !status.adAccountId) {
    throw new Error(
      `Meta API não configurada. Variáveis ausentes no servidor: ${status.missing.join(", ")}`
    );
  }

  const accessToken = process.env.META_ACCESS_TOKEN!.trim();
  const actAccountId = `act_${status.adAccountId}`;
  const apiVersion = status.apiVersion;

  // Datas padrão: últimos 30 dias até hoje
  const today = todayInSaoPaulo();
  const until = params.until && isIsoDay(params.until) ? params.until : today;
  const since = params.since && isIsoDay(params.since) ? params.since : addDays(until, -30);

  const fields = [
    "date_start",
    "date_stop",
    "account_id",
    "account_name",
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
    "spend",
    "impressions",
    "reach",
    "clicks",
    "inline_link_clicks",
    "actions",
    "action_values",
  ].join(",");

  let nextUrl: string | null =
    `https://graph.facebook.com/${apiVersion}/${actAccountId}/insights` +
    `?access_token=${encodeURIComponent(accessToken)}` +
    `&level=ad` +
    `&time_increment=1` +
    `&fields=${encodeURIComponent(fields)}` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    `&limit=500`;

  const allItems: MetaInsightItem[] = [];
  let pageCount = 0;
  const maxPages = 100; // Limite de segurança contra loops

  while (nextUrl && pageCount < maxPages) {
    pageCount++;
    const response = await fetch(nextUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    const json = (await response.json()) as MetaInsightsResponse;

    if (!response.ok || json.error) {
      const err = json.error;
      const msg = err?.message || `Erro HTTP ${response.status} ao consultar a Meta API`;
      throw new Error(`Falha na Meta Marketing API (código ${err?.code ?? response.status}): ${msg}`);
    }

    if (Array.isArray(json.data)) {
      allItems.push(...json.data);
    }

    nextUrl = json.paging?.next ?? null;
  }

  const rawPayload = JSON.stringify(allItems);
  let resolvedAccountName = `Conta ${status.adAccountId}`;

  // Se não houver dados no período
  if (allItems.length === 0) {
    const emptyReport: ParsedAdsReport = {
      rows: [],
      columns: [],
      metrics: [],
      levels: { account: true, campaign: false, adset: false, ad: false },
      firstDay: since,
      lastDay: until,
      days: 0,
      accountIds: [status.adAccountId],
      accountNames: [resolvedAccountName],
      accounts: [resolvedAccountName],
      counts: { campaigns: 0, adsets: 0, ads: 0 },
      currency: "BRL",
      totals: emptyMetricValues(),
      rowsRead: 0,
      rowsIgnored: 0,
      rowsMerged: 0,
      warnings: [],
    };
    return { report: emptyReport, rawPayload, accountName: resolvedAccountName };
  }

  // Mapeia os dados da Meta para AdsReportRow
  const rows: AdsReportRow[] = [];
  const campaignsSet = new Set<string>();
  const adsetsSet = new Set<string>();
  const adsSet = new Set<string>();
  const accountIdsSet = new Set<string>();
  const accountNamesSet = new Set<string>();

  const totals: AdsMetricValues = emptyMetricValues();
  for (const k of ADS_METRIC_KEYS) {
    totals[k] = 0;
  }

  let minDay = "9999-99-99";
  let maxDay = "0000-00-00";

  for (const item of allItems) {
    const day = item.date_start;
    if (day < minDay) minDay = day;
    if (day > maxDay) maxDay = day;

    const accId = item.account_id ? String(item.account_id) : status.adAccountId;
    const accName = item.account_name ? String(item.account_name) : resolvedAccountName;
    resolvedAccountName = accName;

    accountIdsSet.add(accId);
    accountNamesSet.add(accName);

    const campaignId = item.campaign_id ? String(item.campaign_id) : "";
    const campaignName = item.campaign_name ? String(item.campaign_name) : "Campanha não informada";
    if (campaignName) campaignsSet.add(campaignName);

    const adsetId = item.adset_id ? String(item.adset_id) : "";
    const adsetName = item.adset_name ? String(item.adset_name) : "Conjunto não informado";
    if (adsetName) adsetsSet.add(adsetName);

    const adId = item.ad_id ? String(item.ad_id) : "";
    const adName = item.ad_name ? String(item.ad_name) : "Anúncio não informado";
    if (adName) adsSet.add(adName);

    const spend = item.spend ? Number(item.spend) || 0 : 0;
    const impressions = item.impressions ? Number(item.impressions) || 0 : 0;
    const reach = item.reach ? Number(item.reach) || 0 : 0;
    const allClicks = item.clicks ? Number(item.clicks) || 0 : 0;
    const linkClicks = item.inline_link_clicks ? Number(item.inline_link_clicks) || 0 : 0;

    let landingPageViews = 0;
    let conversations = 0;
    let leads = 0;
    let purchases = 0;
    let purchaseValue = 0;
    let results = 0;
    let resultType = "";

    if (Array.isArray(item.actions)) {
      for (const act of item.actions) {
        const val = Number(act.value) || 0;
        const type = String(act.action_type || "").toLowerCase();
        if (type === "landing_page_view") {
          landingPageViews += val;
        } else if (
          type.includes("messaging_conversation_started") ||
          type === "onsite_conversion.messaging_conversation_started_7d" ||
          type === "contact"
        ) {
          conversations += val;
        } else if (type === "lead" || type.startsWith("lead_")) {
          leads += val;
        } else if (type === "purchase" || type === "omni_purchase") {
          purchases += val;
        }
      }
    }

    if (Array.isArray(item.action_values)) {
      for (const act of item.action_values) {
        const val = Number(act.value) || 0;
        const type = String(act.action_type || "").toLowerCase();
        if (type === "purchase" || type === "omni_purchase") {
          purchaseValue += val;
        }
      }
    }

    if (leads > 0) {
      results = leads;
      resultType = "Leads";
    } else if (purchases > 0) {
      results = purchases;
      resultType = "Compras";
    } else if (conversations > 0) {
      results = conversations;
      resultType = "Conversas iniciadas";
    } else if (linkClicks > 0) {
      results = linkClicks;
      resultType = "Cliques no link";
    } else {
      results = allClicks;
      resultType = "Resultados";
    }

    const rowMetrics: AdsMetricValues = {
      spend,
      impressions,
      reach,
      link_clicks: linkClicks,
      all_clicks: allClicks,
      results,
      landing_page_views: landingPageViews,
      conversations,
      leads,
      purchases,
      purchase_value: purchaseValue,
    };

    // Atualiza totais acumulados
    for (const k of ADS_METRIC_KEYS) {
      totals[k] = (totals[k] ?? 0) + (rowMetrics[k] ?? 0);
    }

    rows.push({
      day,
      accountId: accId,
      accountName: accName,
      campaignId,
      campaignName,
      adsetId,
      adsetName,
      adId,
      adName,
      resultType,
      metrics: rowMetrics,
    });
  }

  const metricsPresent: AdsMetricKey[] = ADS_METRIC_KEYS.filter((k) => (totals[k] ?? 0) > 0);
  const accountIds = Array.from(accountIdsSet);
  const accountNames = Array.from(accountNamesSet);
  const accounts = accountNames.length > 0 ? accountNames : accountIds;

  const report: ParsedAdsReport = {
    rows,
    columns: [
      { header: "date_start", usedAs: "Dia" },
      { header: "account_name", usedAs: "Nome da conta" },
      { header: "campaign_name", usedAs: "Nome da campanha" },
      { header: "adset_name", usedAs: "Nome do conjunto de anúncios" },
      { header: "ad_name", usedAs: "Nome do anúncio" },
      { header: "spend", usedAs: "Valor gasto (BRL)" },
      { header: "impressions", usedAs: "Impressões" },
      { header: "reach", usedAs: "Alcance" },
      { header: "clicks", usedAs: "Cliques (todos)" },
      { header: "inline_link_clicks", usedAs: "Cliques no link" },
      { header: "actions", usedAs: "Ações e resultados" },
    ],
    metrics: metricsPresent,
    levels: {
      account: accountNames.length > 0,
      campaign: campaignsSet.size > 0,
      adset: adsetsSet.size > 0,
      ad: adsSet.size > 0,
    },
    firstDay: minDay !== "9999-99-99" ? minDay : since,
    lastDay: maxDay !== "0000-00-00" ? maxDay : until,
    days: rows.length > 0 ? new Set(rows.map((r) => r.day)).size : 0,
    accountIds,
    accountNames,
    accounts,
    counts: {
      campaigns: campaignsSet.size,
      adsets: adsetsSet.size,
      ads: adsSet.size,
    },
    currency: "BRL",
    totals,
    rowsRead: allItems.length,
    rowsIgnored: 0,
    rowsMerged: 0,
    warnings: [],
  };

  return { report, rawPayload, accountName: resolvedAccountName };
}

export async function syncMetaAds(params: {
  since?: string;
  until?: string;
  userId: string;
}): Promise<{
  success: boolean;
  saved: AdsImportSaved;
  accountName: string;
  message: string;
}> {
  const { report, rawPayload, accountName } = await fetchMetaInsights({
    since: params.since,
    until: params.until,
  });

  if (report.rows.length === 0) {
    throw new Error(
      `Nenhum dado de anúncio retornado pela Meta para o período de ${formatDayRange(
        report.firstDay,
        report.lastDay
      )}.`
    );
  }

  const payloadBuffer = Buffer.from(rawPayload, "utf-8");
  const fileHash = createHash("sha256").update(payloadBuffer).digest("hex");

  const fileName = `Meta API — ${accountName} (${formatDayRange(report.firstDay, report.lastDay)})`;

  const saved = await withAdsTransaction(async (run) => {
    return saveImport(run, {
      report,
      file: {
        name: fileName,
        size: payloadBuffer.length,
        hash: fileHash,
        format: "api" as any,
      },
      userId: params.userId,
    });
  });

  const replacedText =
    saved.rowsReplaced > 0
      ? `, substituindo ${pluralize(saved.rowsReplaced, "linha anterior", "linhas anteriores")}`
      : "";

  const message = `Sincronização com a Meta concluída com sucesso: ${pluralize(
    saved.rowsImported,
    "linha diária importada",
    "linhas diárias importadas"
  )} de ${formatDayRange(saved.firstDay, saved.lastDay)}${replacedText}.`;

  return {
    success: true,
    saved,
    accountName,
    message,
  };
}
