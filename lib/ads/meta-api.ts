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
 * segunda chamada. A peça visual nunca bloqueia número — se falhar, a
 * sincronização continua —, mas o motivo da falha VOLTA para a tela. Antes isso
 * era um `continue` silencioso: o painel ficava sem imagem e ninguém sabia por
 * quê.
 *
 * DOIS CAMINHOS, de propósito:
 * 1. `/?ids=` — rápido, uma chamada por lote de 25;
 * 2. `/act_{id}/ads` — o caminho canônico, usado só se o primeiro não trouxer
 *    NENHUMA peça. A expansão de campo dentro do `?ids=` não é garantida em
 *    todas as contas, e era exatamente aí que a imagem sumia sem aviso.
 *
 * E, dentro de cada caminho, duas tentativas de campos: completa e mínima. Sem
 * o recuo, um único campo sem permissão derrubava a peça de todo o lote.
 *
 * `thumbnail_width` não entra aqui: é parâmetro do criativo, não do lote, e
 * fazia a chamada inteira voltar com erro. A imagem grande vem de `image_url`
 * (foto) ou de `picture` (vídeo).
 */
export type MetaCreativeOutcome = {
  creatives: AdCreative[];
  /** Motivo devolvido pela Meta quando nenhuma peça pôde ser lida. */
  error: string | null;
};

const CREATIVE_FIELDS_FULL = [
  "effective_status",
  "permalink_url",
  "creative{id,title,body,object_type,thumbnail_url,image_url,video_id,object_story_spec}",
].join(",");

const CREATIVE_FIELDS_MIN = [
  "effective_status",
  "creative{id,title,thumbnail_url,image_url,object_type}",
].join(",");

/** Uma peça sem a parte de vídeo (que vem numa terceira chamada). */
type CreativePartial = Omit<AdCreative, "videoThumbnailUrl" | "videoUrl">;

/**
 * Converte um nó da Meta na peça que a tela entende.
 *
 * Devolve `null` quando não há nem imagem nem vídeo: um card vazio não ajuda
 * ninguém, e a linha do anúncio continua existindo na tabela.
 */
function buildCreativePartial(adId: string, node: MetaAdNode | undefined): CreativePartial | null {
  const creative = node?.creative;
  if (!creative) return null;

  const story = creative.object_story_spec;
  const linkData = story?.link_data;
  const videoData = story?.video_data;

  const videoId = toId(creative.video_id);
  const format = resolveCreativeFormat(creative, Boolean(videoId));

  // `image_url` é a arte em tamanho cheio; `thumbnail_url` é um selo de 64px.
  // Por isso a ordem: arte grande primeiro, selo só como último recurso.
  const imageUrl = creative.image_url || linkData?.picture || null;
  const thumbnailUrl = creative.thumbnail_url || imageUrl;

  if (!thumbnailUrl && !videoId) return null;

  return {
    adId,
    title: creative.title || linkData?.name || videoData?.title || "",
    body: creative.body || linkData?.message || videoData?.message || "",
    objectType: String(creative.object_type ?? "").toUpperCase(),
    format,
    thumbnailUrl,
    imageUrl,
    videoId,
    effectiveStatus: String(node?.effective_status ?? ""),
    permalinkUrl: node?.permalink_url ?? null,
  };
}

/**
 * Caminho canônico: a borda `ads` da conta, com paginação.
 *
 * Mais lenta que o `?ids=`, mas é a rota documentada para ler criativo em
 * massa. Só é usada quando o caminho rápido não devolveu nada.
 */
async function fetchAdsEdge(
  wanted: Set<string>
): Promise<{ nodes: Map<string, MetaAdNode>; error: string | null }> {
  const status = getMetaConfigStatus();
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();
  const nodes = new Map<string, MetaAdNode>();

  if (!accessToken || !status.adAccountId) {
    return { nodes, error: "Token ou conta de anúncios não configurados no servidor." };
  }

  let url: string | null =
    `https://graph.facebook.com/${status.apiVersion}/act_${status.adAccountId}/ads` +
    `?fields=${encodeURIComponent(CREATIVE_FIELDS_FULL)}` +
    `&limit=200` +
    `&access_token=${encodeURIComponent(accessToken)}`;

  let error: string | null = null;
  let page = 0;

  while (url && page < 10) {
    page++;
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
      const json = (await response.json()) as {
        data?: MetaAdNode[];
        paging?: { next?: string };
        error?: { message?: string; code?: number };
      };

      if (!response.ok || json.error) {
        error ??= describeMetaError(json);
        break;
      }

      for (const node of json.data ?? []) {
        if (node.id && wanted.has(node.id)) nodes.set(node.id, node);
      }

      // Já achou tudo o que interessava: parar de paginar economiza chamada.
      if (nodes.size >= wanted.size) break;
      url = json.paging?.next ?? null;
    } catch (caught) {
      error ??= caught instanceof Error ? caught.message : "Falha de rede ao falar com a Meta.";
      break;
    }
  }

  return { nodes, error: nodes.size > 0 ? null : error };
}

/** Mensagem da Meta em português de gente, com o código entre parênteses. */
function describeMetaError(json: unknown): string {
  const error = (json as { error?: { message?: string; code?: number } } | null)?.error;
  if (!error) return "A Meta recusou o pedido da peça visual.";
  const code = error.code ? ` (código ${error.code})` : "";
  return `${error.message ?? "Pedido recusado pela Meta."}${code}`;
}

async function fetchAdBatch(
  ids: string[],
  fields: string
): Promise<{ nodes: Record<string, MetaAdNode | undefined> | null; error: string | null }> {
  const status = getMetaConfigStatus();
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();
  if (!accessToken) return { nodes: null, error: "Token da Meta não configurado no servidor." };

  const url =
    `https://graph.facebook.com/${status.apiVersion}/` +
    `?ids=${encodeURIComponent(ids.join(","))}` +
    `&fields=${encodeURIComponent(fields)}` +
    `&access_token=${encodeURIComponent(accessToken)}`;

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    const json = (await response.json()) as Record<string, MetaAdNode | undefined> & {
      error?: { message?: string; code?: number };
    };
    if (!response.ok || json.error) return { nodes: null, error: describeMetaError(json) };
    return { nodes: json, error: null };
  } catch (error) {
    return {
      nodes: null,
      error: error instanceof Error ? error.message : "Falha de rede ao falar com a Meta.",
    };
  }
}

export async function fetchMetaCreatives(adIds: string[]): Promise<MetaCreativeOutcome> {
  const unique = Array.from(new Set(adIds.filter(Boolean)));
  if (unique.length === 0) return { creatives: [], error: null };

  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += 25) {
    chunks.push(unique.slice(index, index + 25));
  }

  let partials: CreativePartial[] = [];
  let firstError: string | null = null;

  // Caminho rápido: um pedido por lote de 25.
  for (const chunk of chunks) {
    let attempt = await fetchAdBatch(chunk, CREATIVE_FIELDS_FULL);

    if (!attempt.nodes) {
      firstError ??= attempt.error;
      attempt = await fetchAdBatch(chunk, CREATIVE_FIELDS_MIN);
      if (!attempt.nodes) continue;
    }

    for (const adId of chunk) {
      const partial = buildCreativePartial(adId, attempt.nodes[adId]);
      if (partial) partials.push(partial);
    }
  }

  // Caminho de reserva: se o lote não devolveu NADA, a expansão de campo do
  // `?ids=` não vale nesta conta. A borda `ads` é a rota documentada.
  if (partials.length === 0) {
    const edge = await fetchAdsEdge(new Set(unique));
    if (edge.nodes.size > 0) {
      partials = [];
      for (const adId of unique) {
        const partial = buildCreativePartial(adId, edge.nodes.get(adId));
        if (partial) partials.push(partial);
      }
    } else {
      firstError ??= edge.error;
    }
  }

  // A miniatura e o arquivo do vídeo vêm do nó do vídeo, não do criativo.
  const videos = await fetchVideoAssets(
    partials.map((item) => item.videoId).filter((id): id is string => Boolean(id))
  );

  const creatives = partials.map((item) => {
    const video = item.videoId ? videos.get(item.videoId) : undefined;
    return {
      ...item,
      // Sem miniatura do vídeo, a do criativo é um quadro parado — serve de reserva.
      videoThumbnailUrl: video?.picture ?? (item.format === "video" ? item.thumbnailUrl : null),
      videoUrl: video?.source ?? null,
    };
  });

  // Só reporta erro quando não veio NENHUMA peça: uma falha parcial não deve
  // assustar quem está vendo a tela cheia de imagem.
  return { creatives, error: creatives.length === 0 ? firstError : null };
}

/**
 * Um vídeo, quando tem: miniatura e arquivo.
 *
 * Duas tentativas de propósito. `source` (o `.mp4`) é o campo mais restrito dos
 * dois; se a Meta recusar, ainda quero a `picture`, que é o que desenha o card.
 * Pedir os dois juntos e desistir no erro deixaria todo anúncio de vídeo sem
 * imagem — e aqui quase todo anúncio é vídeo.
 */
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

    const request = async (fields: string) => {
      const url =
        `https://graph.facebook.com/${status.apiVersion}/` +
        `?ids=${encodeURIComponent(chunk.join(","))}` +
        `&fields=${encodeURIComponent(fields)}` +
        `&access_token=${encodeURIComponent(accessToken)}`;
      const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
      const json = (await response.json()) as Record<
        string,
        { picture?: string; source?: string } | undefined
      > & { error?: unknown };
      if (!response.ok || json.error) return null;
      return json;
    };

    try {
      let json = await request("picture,source");
      if (!json) json = await request("picture");
      if (!json) continue;

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
  /** Motivo da Meta quando nenhuma peça visual pôde ser lida. */
  creativeError: string | null;
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
  const creativeOutcome =
    report.rows.length > 0
      ? await fetchMetaCreatives(report.rows.map((row) => row.adId))
      : { creatives: [], error: null };
  const creatives = creativeOutcome.creatives;

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

  // Avisa quando havia anúncio para ilustrar e a Meta não entregou a peça: sem
  // isso a tela mostra "Sem peça visual" para sempre e parece defeito nosso.
  const creativeNote =
    creativeOutcome.error && saved.rowsImported > 0
      ? ` As fotos e vídeos não puderam ser lidos: ${creativeOutcome.error}`
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
        )} de ${formatDayRange(saved.firstDay, saved.lastDay)}${replacedText}.${creativeNote}`;

  return {
    success: true,
    saved,
    accountName,
    message,
    creatives: creatives.length,
    creativeError: creativeOutcome.error,
  };
}
