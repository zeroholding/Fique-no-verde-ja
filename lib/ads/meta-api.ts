import { createHash } from "node:crypto";
import { addDays, isIsoDay, todayInSaoPaulo } from "./dates";
import { withAdsTransaction } from "./db";
import { formatDayRange, pluralize } from "./format";
import { ADS_METRIC_KEYS, type AdsMetricKey, type AdsMetricValues } from "./metrics";
import type {
  AdCreative,
  AdCreativeFormat,
  AdsReportRow,
  ParsedAdsReport,
} from "./report";
import { saveCreatives, saveImport } from "./store";
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

/**
 * Nó do anúncio na Graph API, só com o que a tela usa.
 *
 * Tudo opcional porque a Meta devolve cada anúncio do jeito que o criativo dele
 * permite: anúncio antigo de publicação de Página não tem `object_story_spec`,
 * e anúncio sem permissão de leitura volta sem `creative`.
 */
type MetaObjectStorySpec = {
  link_data?: {
    message?: string;
    name?: string;
    picture?: string;
    child_attachments?: unknown[];
    call_to_action?: { type?: string };
  };
  video_data?: { message?: string; title?: string };
  template_data?: unknown;
};

type MetaAdCreativeNode = {
  id?: string;
  title?: string;
  body?: string;
  object_type?: string;
  thumbnail_url?: string;
  image_url?: string;
  video_id?: string | number;
  object_story_spec?: MetaObjectStorySpec;
};

type MetaAdNode = {
  id?: string;
  effective_status?: string;
  permalink_url?: string;
  creative?: MetaAdCreativeNode;
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
      requestedFirstDay: since,
      requestedLastDay: until,
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
    // O período PEDIDO é o que vale para cobertura e substituição: sincronizar
    // 30 dias e receber 5 dias de veiculação continua cobrindo os 30 dias. Sem
    // isso os outros 25 apareciam como "sem relatório" e o painel mentia.
    requestedFirstDay: since,
    requestedLastDay: until,
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

/**
 * Busca a peça visual de cada anúncio: imagem, vídeo, texto e status.
 *
 * É o único dado que a Meta não devolve junto do insights: precisa de uma
 * segunda chamada, em lote. Como peça visual é enfeite de tela e não número,
 * TUDO aqui é best-effort: se a permissão não alcançar o criativo ou a chamada
 * falhar, a sincronização continua e o anúncio aparece sem imagem.
 *
 * O que é pedido, e por quê:
 * - `effective_status` define o filtro por situação (Ativo, Pausado...);
 * - `creative.video_id` é o único jeito de saber que o anúncio é vídeo;
 * - `creative.object_story_spec` traz o texto do anúncio (título e corpo);
 * - a miniatura do vídeo vem em `/{video_id}?fields=picture,source`.
 */
export async function fetchMetaCreatives(adIds: string[]): Promise<AdCreative[]> {
  const status = getMetaConfigStatus();
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();
  if (!accessToken || adIds.length === 0) return [];

  const unique = Array.from(new Set(adIds.filter(Boolean)));
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += 25) {
    chunks.push(unique.slice(index, index + 25));
  }

  const fields = [
    "effective_status",
    "permalink_url",
    "creative{id,title,body,object_type,thumbnail_url,image_url,video_id,object_story_spec}",
  ].join(",");

  const partials: Array<Omit<AdCreative, "videoThumbnailUrl" | "videoUrl">> = [];

  for (const chunk of chunks) {
    const url =
      `https://graph.facebook.com/${status.apiVersion}/` +
      `?ids=${encodeURIComponent(chunk.join(","))}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&thumbnail_width=800&thumbnail_height=800` +
      `&access_token=${encodeURIComponent(accessToken)}`;

    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!response.ok) continue;

      const json = (await response.json()) as Record<string, MetaAdNode | undefined>;

      for (const adId of chunk) {
        const node = json[adId];
        const creative = node?.creative;
        if (!creative) continue;

        const story = creative.object_story_spec;
        const linkData = story?.link_data;
        const videoData = story?.video_data;

        const videoId = toId(creative.video_id);
        const objectType = String(creative.object_type ?? "").toUpperCase();
        const format = resolveCreativeFormat(creative, Boolean(videoId));

        const imageUrl = creative.image_url || linkData?.picture || null;
        const thumbnailUrl = creative.thumbnail_url || imageUrl;
        const title = creative.title || linkData?.name || videoData?.title || "";
        const body = creative.body || linkData?.message || videoData?.message || "";

        if (!thumbnailUrl && !videoId) continue;

        partials.push({
          adId,
          title,
          body,
          objectType,
          format,
          thumbnailUrl,
          imageUrl,
          videoId,
          effectiveStatus: String(node?.effective_status ?? ""),
          permalinkUrl: node?.permalink_url ?? null,
        });
      }
    } catch (error) {
      console.warn("[ads] criativo dos anúncios não pôde ser lido:", error);
      break;
    }
  }

  // A miniatura e o arquivo do vídeo vêm do nó do vídeo, não do criativo.
  const videos = await fetchVideoAssets(
    partials.map((item) => item.videoId).filter((id): id is string => Boolean(id))
  );

  return partials.map((item) => {
    const video = item.videoId ? videos.get(item.videoId) : undefined;
    return {
      ...item,
      // Sem miniatura do vídeo, a do criativo é um quadro parado — serve de reserva.
      videoThumbnailUrl: video?.picture ?? (item.format === "video" ? item.thumbnailUrl : null),
      videoUrl: video?.source ?? null,
    };
  });
}

/** Um vídeo, quando tem: miniatura e arquivo. */
async function fetchVideoAssets(
  videoIds: string[]
): Promise<Map<string, { picture: string | null; source: string | null }>> {
  const assets = new Map<string, { picture: string | null; source: string | null }>();
  if (videoIds.length === 0) return assets;

  const status = getMetaConfigStatus();
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();
  if (!accessToken) return assets;

  const unique = Array.from(new Set(videoIds));
  for (let index = 0; index < unique.length; index += 25) {
    const chunk = unique.slice(index, index + 25);
    const url =
      `https://graph.facebook.com/${status.apiVersion}/` +
      `?ids=${encodeURIComponent(chunk.join(","))}` +
      `&fields=${encodeURIComponent("picture,source")}` +
      `&access_token=${encodeURIComponent(accessToken)}`;

    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!response.ok) continue;

      const json = (await response.json()) as Record<
        string,
        { picture?: string; source?: string } | undefined
      >;

      for (const videoId of chunk) {
        const node = json[videoId];
        if (!node) continue;
        assets.set(videoId, { picture: node.picture ?? null, source: node.source ?? null });
      }
    } catch (error) {
      // Vídeo é o enfeite do enfeite: falhou, o anúncio fica com a imagem do criativo.
      console.warn("[ads] miniatura do vídeo não pôde ser lida:", error);
      break;
    }
  }

  return assets;
}

/** IDs da Graph API chegam como número ou texto; aqui sempre viram texto ou nulo. */
function toId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" || text === "0" ? null : text;
}

/**
 * Formato da peça, para a tela saber como desenhar.
 *
 * A ordem importa: vídeo manda em tudo (um carrossel de vídeo ainda é vídeo),
 * depois carrossel, depois coleção. Sem nada disso, é foto ou texto.
 */
function resolveCreativeFormat(
  creative: { object_type?: string; object_story_spec?: MetaObjectStorySpec },
  hasVideo: boolean
): AdCreativeFormat {
  if (hasVideo) return "video";
  const spec = creative.object_story_spec;
  if (spec?.link_data?.child_attachments && spec.link_data.child_attachments.length > 0) {
    return "carousel";
  }
  if (spec?.template_data || spec?.link_data?.call_to_action?.type === "COLLECTION") return "collection";

  const objectType = String(creative.object_type ?? "").toUpperCase();
  if (objectType === "VIDEO") return "video";
  if (objectType === "PHOTO" || objectType === "SHARE") return "image";
  return "text";
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
  /** Quantos anúncios ganharam imagem nesta rodada. */
  creatives: number;
}> {
  const { report, rawPayload, accountName } = await fetchMetaInsights({
    since: params.since,
    until: params.until,
  });

  const payloadBuffer = Buffer.from(rawPayload, "utf-8");
  const fileHash = createHash("sha256").update(payloadBuffer).digest("hex");

  const fileName = `Meta API — ${accountName} (${formatDayRange(report.firstDay, report.lastDay)})`;

  // Período sem veiculação é um resultado válido: grava a cobertura para o
  // painel mostrar zero, e não "dia sem relatório".
  const creatives =
    report.rows.length > 0 ? await fetchMetaCreatives(report.rows.map((row) => row.adId)) : [];

  const saved = await withAdsTransaction(async (run) => {
    const result = await saveImport(run, {
      report,
      file: {
        name: fileName,
        size: payloadBuffer.length,
        hash: fileHash,
        format: "api",
      },
      userId: params.userId,
    });
    if (creatives.length > 0) await saveCreatives(run, creatives);
    return result;
  });

  const replacedText =
    saved.rowsReplaced > 0
      ? `, substituindo ${pluralize(saved.rowsReplaced, "linha anterior", "linhas anteriores")}`
      : "";

  const message =
    saved.rowsImported === 0
      ? `Sincronização concluída: nenhuma veiculação no período de ${formatDayRange(
          saved.firstDay,
          saved.lastDay
        )}. Os dias ficam cobertos e contam como zero.`
      : `Sincronização com a Meta concluída: ${pluralize(
          saved.rowsImported,
          "linha diária importada",
          "linhas diárias importadas"
        )} de ${formatDayRange(saved.firstDay, saved.lastDay)}${replacedText}.`;

  return {
    success: true,
    saved,
    accountName,
    message,
    creatives: creatives.length,
  };
}
