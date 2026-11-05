import { addDays, daysBetween, resolvePresetRange } from "./dates";
import {
  ADS_INTEGER_METRICS,
  ADS_METRIC_KEYS,
  ADS_RATIO_PAIRS,
  computeIndicators,
  emptyMetricValues,
  ratioPairKey,
  type AdsAggregate,
  type AdsIndicatorValues,
  type AdsMetricValues,
} from "./metrics";
import type { AdCreative, AdCreativeFormat, AdsReportRow, ParsedAdsReport } from "./report";
import type {
  AdsCampaignOption,
  AdsCreativeItem,
  AdsDailyPoint,
  AdsDashboardData,
  AdsImportSaved,
  AdsRanking,
  AdsRankingLevel,
} from "./types";

/**
 * Consultas do /ads. Todas recebem um `run` que executa SQL numa conexão já
 * aberta: a rota decide se é conexão simples ou transação (`lib/ads/db.ts`).
 * Assim nada aqui depende do pool, e o mesmo código roda contra um banco de
 * teste.
 *
 * Regra de substituição: o envio mais novo vale para os dias que ele cobre.
 * Ao salvar, saem as linhas antigas desses dias das contas presentes no
 * arquivo (ou de todas, se o arquivo não identifica conta). Assim reenviar um
 * período nunca soma em dobro, mesmo com nomes de anúncio trocados.
 */

export type AdsQueryResult<R> = { rows: R[]; rowCount: number };
export type AdsRunner = <R = Record<string, unknown>>(
  text: string,
  params?: unknown[]
) => Promise<AdsQueryResult<R>>;

type SqlRow = Record<string, unknown>;

/** Chaves de trava do Postgres para serializar salvamentos e exclusões. */
const LOCK_NAMESPACE = 72701;
export const ADS_SCHEMA_LOCK_SQL = `SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}, 1)`;
const WRITE_LOCK_SQL = `SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}, 2)`;

const INSERT_CHUNK = 2000;
const RANKING_LIMIT = 500;

// ---------------------------------------------------------------
// Agregação compartilhada (totais, dias e ranking usam a mesma conta)
// ---------------------------------------------------------------

function buildAggregateColumns(): string {
  const columns = [
    "COUNT(*)::int AS agg_rows",
    "COUNT(DISTINCT day)::int AS agg_days",
    "(COUNT(DISTINCT day) FILTER (WHERE reach IS NOT NULL))::int AS agg_reach_days",
  ];
  for (const metric of ADS_METRIC_KEYS) {
    columns.push(`SUM(${metric}) AS sum_${metric}`);
  }
  for (const pair of ADS_RATIO_PAIRS) {
    const [numerator, denominator] = pair;
    const key = ratioPairKey(pair);
    const both = `${numerator} IS NOT NULL AND ${denominator} IS NOT NULL`;
    columns.push(
      `SUM(${numerator}) FILTER (WHERE ${both}) AS num_${key}`,
      `SUM(${denominator}) FILTER (WHERE ${both}) AS den_${key}`
    );
  }
  return columns.join(",\n       ");
}

const AGGREGATE_COLUMNS = buildAggregateColumns();

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function readAggregate(row: SqlRow | undefined): AdsAggregate {
  const source = row ?? {};
  const sums = emptyMetricValues();
  for (const metric of ADS_METRIC_KEYS) {
    sums[metric] = toNumber(source[`sum_${metric}`]);
  }
  const pairs: AdsAggregate["pairs"] = {};
  for (const pair of ADS_RATIO_PAIRS) {
    const key = ratioPairKey(pair);
    const numerator = toNumber(source[`num_${key}`]);
    const denominator = toNumber(source[`den_${key}`]);
    pairs[key] = numerator === null || denominator === null ? null : { numerator, denominator };
  }
  return {
    rows: toNumber(source.agg_rows) ?? 0,
    days: toNumber(source.agg_days) ?? 0,
    reachDays: toNumber(source.agg_reach_days) ?? 0,
    sums,
    pairs,
  };
}

/** Dia coberto por relatório mas sem linha: não houve veiculação, então vale zero. */
function zeroAggregate(present: AdsMetricValues): AdsAggregate {
  const sums = emptyMetricValues();
  for (const metric of ADS_METRIC_KEYS) {
    sums[metric] = present[metric] === null ? null : 0;
  }
  const pairs: AdsAggregate["pairs"] = {};
  for (const pair of ADS_RATIO_PAIRS) {
    const [numerator, denominator] = pair;
    pairs[ratioPairKey(pair)] =
      present[numerator] === null || present[denominator] === null
        ? null
        : { numerator: 0, denominator: 0 };
  }
  return { rows: 0, days: 0, reachDays: 0, sums, pairs };
}

function emptyIndicators(): AdsIndicatorValues {
  return computeIndicators({ rows: 0, days: 0, reachDays: 0, sums: emptyMetricValues(), pairs: {} });
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

// ---------------------------------------------------------------
// Substituição por período
// ---------------------------------------------------------------

type ReplacementScope = {
  from: string;
  to: string;
  /** O arquivo não identifica conta: substitui tudo no período. */
  everything: boolean;
  accountIds: string[];
  accountNames: string[];
};

function replacementScope(report: ParsedAdsReport): ReplacementScope {
  return {
    // Período PEDIDO, não o dos dados: sincronizar 30 dias substitui os 30,
    // mesmo que só 5 tenham veiculação.
    from: report.requestedFirstDay,
    to: report.requestedLastDay,
    everything: !report.levels.account,
    accountIds: report.accountIds,
    accountNames: report.accountNames,
  };
}

/** Linhas que um envio substitui. Parâmetros $1 a $5 (`scopeParams`). */
const SCOPE_WHERE = `day BETWEEN $1::date AND $2::date
   AND ($3::boolean
        OR account_id = ANY($4::text[])
        OR account_name = ANY($5::text[])
        OR (account_id = '' AND account_name = ''))`;

function scopeParams(scope: ReplacementScope): unknown[] {
  return [scope.from, scope.to, scope.everything, scope.accountIds, scope.accountNames];
}

export type AdsFileInfo = {
  name: string;
  size: number;
  hash: string;
  format: "csv" | "xlsx" | "api";
};

type DailyColumn = {
  column: string;
  type: "date" | "text" | "bigint" | "numeric";
  pick: (row: AdsReportRow) => unknown;
};

const DAILY_COLUMNS: DailyColumn[] = [
  { column: "day", type: "date", pick: (row) => row.day },
  { column: "account_id", type: "text", pick: (row) => row.accountId },
  { column: "account_name", type: "text", pick: (row) => row.accountName },
  { column: "campaign_id", type: "text", pick: (row) => row.campaignId },
  { column: "campaign_name", type: "text", pick: (row) => row.campaignName },
  { column: "adset_id", type: "text", pick: (row) => row.adsetId },
  { column: "adset_name", type: "text", pick: (row) => row.adsetName },
  { column: "ad_id", type: "text", pick: (row) => row.adId },
  { column: "ad_name", type: "text", pick: (row) => row.adName },
  { column: "result_type", type: "text", pick: (row) => row.resultType },
  ...ADS_METRIC_KEYS.map(
    (metric): DailyColumn => ({
      column: metric,
      type: ADS_INTEGER_METRICS.has(metric) ? "bigint" : "numeric",
      pick: (row) => row.metrics[metric],
    })
  ),
];

/** Inserção em lote: uma lista por coluna e `UNNEST`, sem montar SQL com valores. */
async function insertDailyRows(run: AdsRunner, importId: string, rows: AdsReportRow[]): Promise<void> {
  const params: unknown[] = [importId];
  const arrays = DAILY_COLUMNS.map((column) => {
    params.push(rows.map(column.pick));
    return `$${params.length}::${column.type}[]`;
  });
  await run(
    `INSERT INTO ads_daily (import_id, ${DAILY_COLUMNS.map((column) => column.column).join(", ")})
     SELECT $1::uuid, * FROM UNNEST(${arrays.join(", ")})`,
    params
  );
}

/** Grava o envio. Precisa rodar dentro de transação. */
export async function saveImport(
  run: AdsRunner,
  input: { report: ParsedAdsReport; file: AdsFileInfo; userId: string }
): Promise<AdsImportSaved> {
  const { report, file } = input;
  await run(WRITE_LOCK_SQL);

  const scope = replacementScope(report);
  const removed = await run<{ import_id: string; rows: number }>(
    `WITH removed AS (DELETE FROM ads_daily WHERE ${SCOPE_WHERE} RETURNING import_id)
     SELECT import_id, COUNT(*)::int AS rows FROM removed GROUP BY import_id`,
    scopeParams(scope)
  );
  const rowsReplaced = removed.rows.reduce((total, row) => total + Number(row.rows), 0);
  const touchedImports = removed.rows.map((row) => row.import_id);

  // Envios que perderam linhas deixam de cobrir esses dias. Se o envio novo for
  // excluído depois, os dias aparecem como "sem relatório", e não como zero.
  if (touchedImports.length > 0) {
    await run(
      `WITH hit AS (
         DELETE FROM ads_coverage
          WHERE import_id = ANY($3::uuid[])
            AND day_from <= $2::date
            AND day_to >= $1::date
         RETURNING import_id, day_from, day_to
       )
       INSERT INTO ads_coverage (import_id, day_from, day_to)
       SELECT import_id, day_from, $1::date - 1 FROM hit WHERE day_from < $1::date
       UNION ALL
       SELECT import_id, $2::date + 1, day_to FROM hit WHERE day_to > $2::date`,
      [scope.from, scope.to, touchedImports]
    );
  }

  const created = await run<{ id: string }>(
    `INSERT INTO ads_imports (
       file_name, file_size, file_hash, file_format, account_ids, account_names,
       currency, date_start, date_end, rows_total, rows_imported, rows_ignored,
       rows_replaced, metrics, columns, uploaded_by
     ) VALUES (
       $1, $2, $3, $4, $5::text[], $6::text[],
       $7, $8::date, $9::date, $10, $11, $12,
       $13, $14::text[], $15::jsonb, $16::uuid
     )
     RETURNING id`,
    [
      file.name,
      file.size,
      file.hash,
      file.format,
      report.accountIds,
      report.accountNames,
      report.currency,
      report.requestedFirstDay,
      report.requestedLastDay,
      report.rowsRead,
      report.rows.length,
      report.rowsIgnored,
      rowsReplaced,
      report.metrics,
      JSON.stringify(report.columns),
      input.userId,
    ]
  );
  const importId = created.rows[0].id;

  await run(
    `INSERT INTO ads_coverage (import_id, day_from, day_to) VALUES ($1::uuid, $2::date, $3::date)`,
    [importId, report.requestedFirstDay, report.requestedLastDay]
  );

  for (let start = 0; start < report.rows.length; start += INSERT_CHUNK) {
    await insertDailyRows(run, importId, report.rows.slice(start, start + INSERT_CHUNK));
  }

  return {
    id: importId,
    rowsImported: report.rows.length,
    rowsReplaced,
    firstDay: report.requestedFirstDay,
    lastDay: report.requestedLastDay,
  };
}

// ---------------------------------------------------------------
// Imagens dos anúncios
// ---------------------------------------------------------------

/**
 * Grava ou atualiza a peça visual de cada anúncio. Precisa rodar na mesma
 * transação da sincronização: peça órfã (de um lote que falhou depois) não
 * serve.
 *
 * `COALESCE` no vídeo e no link: a segunda chamada (vídeo) pode falhar e vir
 * vazia numa rodada em que já tínhamos o dado. Apagar o que já era conhecido
 * por causa de uma falha de rede seria pior do que ficar com o dado antigo.
 */
export async function saveCreatives(run: AdsRunner, creatives: AdCreative[]): Promise<void> {
  if (creatives.length === 0) return;
  await run(
    `INSERT INTO ads_creatives (
       ad_id, title, body, object_type, format, thumbnail_url, image_url,
       video_id, video_thumbnail_url, video_url, effective_status, permalink_url, updated_at
     )
     SELECT ad_id, title, body, object_type, format, thumbnail_url, image_url,
            video_id, video_thumbnail_url, video_url, effective_status, permalink_url, NOW()
       FROM UNNEST(
         $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
         $8::text[], $9::text[], $10::text[], $11::text[], $12::text[]
       ) AS t(
         ad_id, title, body, object_type, format, thumbnail_url, image_url,
         video_id, video_thumbnail_url, video_url, effective_status, permalink_url
       )
     ON CONFLICT (ad_id) DO UPDATE
        SET title = EXCLUDED.title,
            body = EXCLUDED.body,
            object_type = EXCLUDED.object_type,
            format = EXCLUDED.format,
            thumbnail_url = EXCLUDED.thumbnail_url,
            image_url = EXCLUDED.image_url,
            video_id = COALESCE(EXCLUDED.video_id, ads_creatives.video_id),
            video_thumbnail_url = COALESCE(EXCLUDED.video_thumbnail_url, ads_creatives.video_thumbnail_url),
            video_url = COALESCE(EXCLUDED.video_url, ads_creatives.video_url),
            effective_status = EXCLUDED.effective_status,
            permalink_url = COALESCE(EXCLUDED.permalink_url, ads_creatives.permalink_url),
            updated_at = NOW()`,
    [
      creatives.map((item) => item.adId),
      creatives.map((item) => item.title),
      creatives.map((item) => item.body),
      creatives.map((item) => item.objectType),
      creatives.map((item) => item.format),
      creatives.map((item) => item.thumbnailUrl),
      creatives.map((item) => item.imageUrl),
      creatives.map((item) => item.videoId),
      creatives.map((item) => item.videoThumbnailUrl),
      creatives.map((item) => item.videoUrl),
      creatives.map((item) => item.effectiveStatus),
      creatives.map((item) => item.permalinkUrl),
    ]
  );
}

type CreativeRow = {
  ad_id: string;
  title: string;
  body: string;
  object_type: string;
  format: string;
  thumbnail_url: string | null;
  image_url: string | null;
  video_id: string | null;
  video_thumbnail_url: string | null;
  video_url: string | null;
  effective_status: string;
  permalink_url: string | null;
};

const CREATIVE_COLUMNS = `ad_id, title, body, object_type, format, thumbnail_url, image_url,
       video_id, video_thumbnail_url, video_url, effective_status, permalink_url`;

async function loadCreatives(run: AdsRunner, adIds: string[]): Promise<Map<string, CreativeRow>> {
  if (adIds.length === 0) return new Map();
  const result = await run<CreativeRow>(
    `SELECT ${CREATIVE_COLUMNS} FROM ads_creatives WHERE ad_id = ANY($1::text[])`,
    [adIds]
  );
  return new Map(result.rows.map((row) => [row.ad_id, row]));
}

const CREATIVE_FORMATS = new Set(["image", "video", "carousel", "collection", "text"]);

/**
 * O banco guarda `format` como texto livre; a tela só entende os cinco formatos
 * conhecidos. O que não for reconhecido vira texto, nunca `undefined` — assim a
 * galeria nunca fica sem desenhar a peça.
 */
function normalizeFormat(raw: string): AdCreativeFormat {
  return (CREATIVE_FORMATS.has(raw) ? raw : "text") as AdCreativeFormat;
}

function toCreative(row: CreativeRow | undefined): AdCreative | null {
  if (!row) return null;
  return {
    adId: row.ad_id,
    title: row.title,
    body: row.body,
    objectType: row.object_type,
    format: normalizeFormat(row.format),
    thumbnailUrl: row.thumbnail_url,
    imageUrl: row.image_url,
    videoId: row.video_id,
    videoThumbnailUrl: row.video_thumbnail_url,
    videoUrl: row.video_url,
    effectiveStatus: row.effective_status,
    permalinkUrl: row.permalink_url,
  };
}

/** Filtros de recorte aplicados na consulta. Tudo opcional. */
export type AdsFilters = {
  /** Só o que rodou neste dia (o atalho "Hoje"). */
  day: string | null;
  /** Nível de status do anúncio: "active", "paused" ou "archived". */
  status: string | null;
  campaignId: string | null;
  /** Busca livre em nome do anúncio, campanha e conjunto. */
  search: string | null;
};

export const ADS_STATUS_GROUPS = [
  { value: "active", label: "Ativos" },
  { value: "paused", label: "Pausados" },
  { value: "archived", label: "Arquivados" },
] as const;

/**
 * SQL dos filtros de status/busca, sobre `ads_daily` (alias `d`) cruzado com
 * `ads_creatives` (alias `c`).
 *
 * O status do anúncio vive no criativo, não na linha diária: por isso o filtro
 * usa `EXISTS` em vez de `JOIN`. `JOIN` repetiria a linha diária uma vez por
 * criativo e inflaria o investimento.
 */
function filterSql(filters: AdsFilters, firstParam: number): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.campaignId) {
    params.push(filters.campaignId);
    clauses.push(`d.campaign_id = $${firstParam + params.length - 1}`);
  }

  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    clauses.push(
      `(LOWER(d.ad_name) LIKE $${firstParam + params.length - 1}
        OR LOWER(d.campaign_name) LIKE $${firstParam + params.length - 1}
        OR LOWER(d.adset_name) LIKE $${firstParam + params.length - 1})`
    );
  }

  if (filters.status) {
    params.push(filters.status);
    const index = firstParam + params.length - 1;
    clauses.push(
      `EXISTS (
         SELECT 1 FROM ads_creatives c
          WHERE c.ad_id = d.ad_id
            AND LOWER(c.effective_status) LIKE $${index} || '%'
       )`
    );
  }

  return { where: clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "", params };
}

/**
 * Catálogo de criativos do período: cada anúncio uma vez, com a peça visual e
 * os números somados.
 *
 * A imagem e o vídeo são da peça, então não se somam por dia — a galeria mostra
 * o anúncio, e o investimento é a soma dos dias em que ele rodou.
 */
async function loadCreativeCatalog(
  run: AdsRunner,
  range: DayInterval,
  filters: AdsFilters
): Promise<{ creatives: AdsCreativeItem[]; total: number; counts: Record<string, number> }> {
  const extra = filterSql(filters, 3);
  const params: unknown[] = [range.from, range.to, ...extra.params];

  const result = await run<CatalogSqlRow>(
    `SELECT d.ad_id,
            (ARRAY_AGG(d.ad_name ORDER BY d.day DESC))[1] AS ad_name,
            (ARRAY_AGG(d.campaign_name ORDER BY d.day DESC))[1] AS campaign_name,
            (ARRAY_AGG(d.campaign_id ORDER BY d.day DESC))[1] AS campaign_id,
            (ARRAY_AGG(d.adset_name ORDER BY d.day DESC))[1] AS adset_name,
            ${AGGREGATE_COLUMNS}
       FROM ads_daily d
      WHERE d.day BETWEEN $1::date AND $2::date
        AND d.ad_id <> ''
        ${extra.where}
      GROUP BY d.ad_id
      ORDER BY SUM(d.spend) DESC NULLS LAST
      LIMIT 120`,
    params
  );

  const creativesMap = await loadCreatives(
    run,
    result.rows.map((row) => row.ad_id)
  );

  const creatives: AdsCreativeItem[] = result.rows.map((row) => {
    const aggregate = readAggregate(row);
    return {
      adId: row.ad_id,
      name: row.ad_name ?? "",
      campaignName: row.campaign_name ?? "",
      campaignId: row.campaign_id ?? "",
      adsetName: row.adset_name ?? "",
      days: aggregate.days,
      creative: toCreative(creativesMap.get(row.ad_id)),
      values: computeIndicators(aggregate),
    };
  });

  // Contagem por situação para as abas da galeria: mostra quantos existem em
  // cada aba antes de a pessoa clicar.
  const countsResult = await run<{ effective_status: string; total: number }>(
    `SELECT LOWER(c.effective_status) AS effective_status, COUNT(DISTINCT d.ad_id)::int AS total
       FROM ads_daily d
       JOIN ads_creatives c ON c.ad_id = d.ad_id
      WHERE d.day BETWEEN $1::date AND $2::date
        AND d.ad_id <> ''
        AND c.effective_status <> ''
      GROUP BY LOWER(c.effective_status)`,
    [range.from, range.to]
  );

  const counts: Record<string, number> = { all: creatives.length };
  for (const group of ADS_STATUS_GROUPS) {
    counts[group.value] = countsResult.rows
      .filter((row) => row.effective_status.startsWith(group.value))
      .reduce((total, row) => total + Number(row.total), 0);
  }

  return { creatives, total: creatives.length, counts };
}

// ---------------------------------------------------------------
// Painel
// ---------------------------------------------------------------

type DayInterval = { from: string; to: string };

/** Junta intervalos que se tocam ou se sobrepõem. */
function mergeIntervals(intervals: DayInterval[]): DayInterval[] {
  const sorted = [...intervals].sort((left, right) => (left.from < right.from ? -1 : 1));
  const merged: DayInterval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.from <= addDays(last.to, 1)) {
      if (interval.to > last.to) last.to = interval.to;
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

const LEVEL_SQL: Record<AdsRankingLevel, { key: string; name: string; presence: string }> = {
  campaign: {
    key: `CASE WHEN campaign_id <> '' THEN 'i:' || campaign_id ELSE 'n:' || campaign_name END`,
    name: "campaign_name",
    presence: "with_campaign",
  },
  adset: {
    key: `CASE WHEN adset_id <> '' THEN 'i:' || adset_id
               ELSE 'n:' || campaign_name || chr(31) || adset_name END`,
    name: "adset_name",
    presence: "with_adset",
  },
  ad: {
    key: `CASE WHEN ad_id <> '' THEN 'i:' || ad_id
               ELSE 'n:' || campaign_name || chr(31) || adset_name || chr(31) || ad_name END`,
    name: "ad_name",
    presence: "with_ad",
  },
};

const LEVEL_ORDER: AdsRankingLevel[] = ["campaign", "adset", "ad"];

type RankingSqlRow = SqlRow & {
  entity_key: string;
  account_key: string;
  entity_name: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  account_name: string | null;
};

type CatalogSqlRow = SqlRow & {
  ad_id: string;
  ad_name: string | null;
  campaign_name: string | null;
  campaign_id: string | null;
  adset_name: string | null;
};

async function loadRanking(
  run: AdsRunner,
  level: AdsRankingLevel,
  range: DayInterval,
  totalSpend: number | null,
  filters: AdsFilters = { day: null, status: null, campaignId: null, search: null }
): Promise<AdsRanking> {
  const sql = LEVEL_SQL[level];
  const extra = filterSql(filters, 3);
  const params: unknown[] = [range.from, range.to, ...extra.params];
  const result = await run<RankingSqlRow>(
    `SELECT ${sql.key} AS entity_key,
            COALESCE(NULLIF(d.account_id, ''), d.account_name) AS account_key,
            (ARRAY_AGG(${sql.name} ORDER BY d.day DESC))[1] AS entity_name,
            (ARRAY_AGG(d.campaign_name ORDER BY d.day DESC))[1] AS campaign_name,
            (ARRAY_AGG(d.adset_name ORDER BY d.day DESC))[1] AS adset_name,
            (ARRAY_AGG(d.account_name ORDER BY d.day DESC))[1] AS account_name,
            ${AGGREGATE_COLUMNS}
       FROM ads_daily d
      WHERE d.day BETWEEN $1::date AND $2::date${extra.where}
      GROUP BY 1, 2
      ORDER BY SUM(d.spend) DESC NULLS LAST, entity_name ASC
      LIMIT ${RANKING_LIMIT + 1}`,
    params
  );

  const kept = result.rows.slice(0, RANKING_LIMIT);

  // Imagem só faz sentido no nível de anúncio: campanha e conjunto agrupam
  // vários criativos e não têm uma foto que os represente.
  const creatives =
    level === "ad"
      ? await loadCreatives(
          run,
          kept
            .map((row) => row.entity_key)
            .filter((key) => key.startsWith("i:"))
            .map((key) => key.slice(2))
        )
      : new Map<string, CreativeRow>();

  const rows = kept.map((row) => {
    const aggregate = readAggregate(row);
    const values = computeIndicators(aggregate);
    const adId = level === "ad" && row.entity_key.startsWith("i:") ? row.entity_key.slice(2) : null;
    const creative = adId ? creatives.get(adId) : undefined;
    return {
      key: `${row.entity_key}\u001f${row.account_key}`,
      name: row.entity_name ?? "",
      campaign: level === "campaign" ? "" : row.campaign_name ?? "",
      adset: level === "ad" ? row.adset_name ?? "" : "",
      account: row.account_name || row.account_key || "",
      days: aggregate.days,
      spendShare:
        values.spend !== null && totalSpend !== null && totalSpend > 0 ? values.spend / totalSpend : null,
      creative: toCreative(creative),
      values,
    };
  });

  return { level, rows, truncated: result.rows.length > RANKING_LIMIT };
}

function emptyDashboard(today: string, lastImport: AdsDashboardData["lastImport"]): AdsDashboardData {
  return {
    hasData: false,
    coverage: null,
    range: { from: today, to: today, days: 1 },
    baseRange: { from: today, to: today, days: 1 },
    previousRange: null,
    totals: emptyIndicators(),
    previous: null,
    rowsInRange: 0,
    daily: [],
    missingDays: 0,
    missingRanges: [],
    rankings: [],
    creatives: [],
    creativeCounts: {},
    campaigns: [],
    filters: { status: null, campaignId: null, search: null, onlyToday: false },
    accounts: [],
    resultTypes: [],
    currency: "BRL",
    currencies: [],
    lastImport,
  };
}

/**
 * Dados do painel para um período. Sem período, usa os últimos 30 dias com
 * dados. `from`/`to` já chegam validados pela rota.
 *
 * Os filtros valem para TUDO que aparece na tela — indicadores, gráfico, tabela
 * e galeria. Um recorte que muda o gráfico e não muda o total seria pior que
 * não ter filtro: a pessoa compararia números de recortes diferentes.
 */
export async function loadDashboard(
  run: AdsRunner,
  query: { from: string | null; to: string | null } & AdsFilters,
  today: string
): Promise<AdsDashboardData> {
  const filters: AdsFilters = {
    day: query.day,
    status: query.status,
    campaignId: query.campaignId,
    search: query.search,
  };

  const latest = await run<{ file_name: string; created_at: unknown }>(
    `SELECT file_name, created_at FROM ads_imports ORDER BY created_at DESC LIMIT 1`
  );
  const lastImport = latest.rows[0]
    ? { fileName: latest.rows[0].file_name, createdAt: toIso(latest.rows[0].created_at) }
    : null;

  const spans = await run<{ first_day: string; last_day: string }>(
    `SELECT to_char(day_from, 'YYYY-MM-DD') AS first_day,
            to_char(day_to, 'YYYY-MM-DD') AS last_day
       FROM ads_coverage
      WHERE day_from <= day_to`
  );
  if (spans.rows.length === 0) return emptyDashboard(today, lastImport);

  const covered = mergeIntervals(spans.rows.map((row) => ({ from: row.first_day, to: row.last_day })));
  const coverage = { firstDay: covered[0].from, lastDay: covered[covered.length - 1].to };

  const baseRange =
    query.from && query.to
      ? { from: query.from, to: query.to }
      : resolvePresetRange("30d", coverage, today);

  // "Hoje" é um recorte de UM dia dentro do período escolhido: ele não muda o
  // período, muda o retrato. Assim os comparativos continuam coerentes.
  const range = filters.day ? { from: filters.day, to: filters.day } : baseRange;
  const length = daysBetween(baseRange.from, baseRange.to) + 1;
  const previousRange = { from: addDays(baseRange.from, -length), to: addDays(baseRange.from, -1) };

  const currentFilter = filterSql(filters, 3);
  const currentResult = await run(
    `SELECT ${AGGREGATE_COLUMNS},
            (COUNT(*) FILTER (WHERE d.campaign_id <> '' OR d.campaign_name <> ''))::int AS with_campaign,
            (COUNT(*) FILTER (WHERE d.adset_id <> '' OR d.adset_name <> ''))::int AS with_adset,
            (COUNT(*) FILTER (WHERE d.ad_id <> '' OR d.ad_name <> ''))::int AS with_ad
       FROM ads_daily d
      WHERE d.day BETWEEN $1::date AND $2::date${currentFilter.where}`,
    [range.from, range.to, ...currentFilter.params]
  );
  const currentRow = currentResult.rows[0] ?? {};
  const current = readAggregate(currentRow);
  const totals = computeIndicators(current);

  const previousFilter = filterSql(filters, 3);
  const previousResult = await run(
    `SELECT ${AGGREGATE_COLUMNS}
       FROM ads_daily d
      WHERE d.day BETWEEN $1::date AND $2::date${previousFilter.where}`,
    [previousRange.from, previousRange.to, ...previousFilter.params]
  );
  const previousAggregate = readAggregate(previousResult.rows[0]);

  const dailyFilter = filterSql(filters, 3);
  const dailyResult = await run<SqlRow & { day: string }>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day, ${AGGREGATE_COLUMNS}
       FROM ads_daily d
      WHERE d.day BETWEEN $1::date AND $2::date${dailyFilter.where}
      GROUP BY d.day
      ORDER BY d.day`,
    [range.from, range.to, ...dailyFilter.params]
  );
  const byDay = new Map<string, SqlRow>(dailyResult.rows.map((row) => [row.day, row]));
  const isCovered = (day: string) => covered.some((span) => day >= span.from && day <= span.to);

  const daily: AdsDailyPoint[] = [];
  const missingRanges: DayInterval[] = [];
  let missingDays = 0;
  for (let offset = 0; offset < length; offset++) {
    const day = addDays(range.from, offset);
    const row = byDay.get(day);
    const dayCovered = row !== undefined || isCovered(day);
    let values: AdsIndicatorValues;
    if (row) values = computeIndicators(readAggregate(row));
    else if (dayCovered) values = computeIndicators(zeroAggregate(current.sums));
    else values = emptyIndicators();
    daily.push({ day, covered: dayCovered, values });

    if (!dayCovered) {
      missingDays += 1;
      const last = missingRanges[missingRanges.length - 1];
      if (last && last.to === addDays(day, -1)) last.to = day;
      else missingRanges.push({ from: day, to: day });
    }
  }

  const rankings: AdsRanking[] = [];
  for (const level of LEVEL_ORDER) {
    if ((toNumber(currentRow[LEVEL_SQL[level].presence]) ?? 0) > 0) {
      rankings.push(await loadRanking(run, level, range, totals.spend, filters));
    }
  }

  const catalog = await loadCreativeCatalog(run, range, filters);

  const campaignsResult = await run<{ id: string; name: string; spend: number | null }>(
    `SELECT CASE WHEN campaign_id <> '' THEN campaign_id ELSE 'n:' || campaign_name END AS id,
            (ARRAY_AGG(campaign_name ORDER BY day DESC))[1] AS name,
            SUM(spend) AS spend
       FROM ads_daily
      WHERE day BETWEEN $1::date AND $2::date
      GROUP BY 1
      ORDER BY SUM(spend) DESC NULLS LAST, name
      LIMIT 100`,
    [baseRange.from, baseRange.to]
  );
  const campaigns: AdsCampaignOption[] = campaignsResult.rows.map((row) => ({
    id: row.id,
    name: row.name ?? "",
    spend: toNumber(row.spend),
  }));

  const accountsResult = await run<{ account: string }>(
    `SELECT COALESCE(NULLIF(account_name, ''), account_id) AS account
       FROM ads_daily
      WHERE day BETWEEN $1::date AND $2::date
        AND (account_name <> '' OR account_id <> '')
      GROUP BY 1
      ORDER BY SUM(spend) DESC NULLS LAST, 1
      LIMIT 20`,
    [range.from, range.to]
  );

  const resultTypesResult = await run<{ result_type: string }>(
    `SELECT result_type
       FROM ads_daily
      WHERE day BETWEEN $1::date AND $2::date AND result_type <> ''
      GROUP BY result_type
      ORDER BY COUNT(*) DESC, result_type
      LIMIT 5`,
    [range.from, range.to]
  );

  const currencyResult = await run<{ currency: string }>(
    `SELECT i.currency
       FROM ads_imports i
      WHERE i.currency IS NOT NULL AND i.currency <> ''
        AND EXISTS (
          SELECT 1 FROM ads_daily
           WHERE import_id = i.id AND day BETWEEN $1::date AND $2::date
        )
      GROUP BY i.currency
      ORDER BY MAX(i.created_at) DESC`,
    [range.from, range.to]
  );
  const currencies = currencyResult.rows.map((row) => row.currency);

  return {
    hasData: true,
    coverage,
    range: { from: range.from, to: range.to, days: range === baseRange ? length : 1 },
    baseRange: { from: baseRange.from, to: baseRange.to, days: length },
    previousRange: previousAggregate.rows > 0 ? previousRange : null,
    totals,
    previous: previousAggregate.rows > 0 ? computeIndicators(previousAggregate) : null,
    rowsInRange: current.rows,
    daily,
    missingDays,
    missingRanges: missingRanges.slice(0, 5),
    rankings,
    creatives: catalog.creatives,
    creativeCounts: catalog.counts,
    campaigns,
    filters: {
      status: filters.status,
      campaignId: filters.campaignId,
      search: filters.search,
      onlyToday: Boolean(filters.day),
    },
    accounts: accountsResult.rows.map((row) => row.account),
    resultTypes: resultTypesResult.rows.map((row) => row.result_type),
    currency: currencies[0] ?? "BRL",
    currencies,
    lastImport,
  };
}
