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
  type AdsMetricKey,
  type AdsMetricValues,
} from "./metrics";
import type { AdsReportRow, ParsedAdsReport } from "./report-rows";
import type {
  AdsDailyPoint,
  AdsDashboardData,
  AdsImportItem,
  AdsImportPreview,
  AdsImportSaved,
  AdsImportStatus,
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
    from: report.firstDay,
    to: report.lastDay,
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

export async function previewReplacement(
  run: AdsRunner,
  report: ParsedAdsReport,
  fileHash: string
): Promise<Pick<AdsImportPreview, "replacement" | "sameFile">> {
  const scope = replacementScope(report);
  const params = scopeParams(scope);

  const current = await run(`SELECT ${AGGREGATE_COLUMNS} FROM ads_daily WHERE ${SCOPE_WHERE}`, params);
  const aggregate = readAggregate(current.rows[0]);

  const affected = await run<{ file_name: string; created_at: unknown }>(
    `SELECT i.file_name, i.created_at
       FROM ads_imports i
      WHERE EXISTS (SELECT 1 FROM ads_daily WHERE import_id = i.id AND ${SCOPE_WHERE})
      ORDER BY i.created_at DESC
      LIMIT 5`,
    params
  );

  const same = await run<{ file_name: string; created_at: unknown }>(
    `SELECT file_name, created_at
       FROM ads_imports
      WHERE file_hash = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [fileHash]
  );

  return {
    replacement: {
      rows: aggregate.rows,
      totals: aggregate.sums,
      imports: affected.rows.map((row) => ({
        fileName: row.file_name,
        createdAt: toIso(row.created_at),
      })),
    },
    sameFile: same.rows[0]
      ? { fileName: same.rows[0].file_name, createdAt: toIso(same.rows[0].created_at) }
      : null,
  };
}

export type AdsFileInfo = {
  name: string;
  size: number;
  hash: string;
  format: "csv" | "xlsx";
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
      report.firstDay,
      report.lastDay,
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
    [importId, report.firstDay, report.lastDay]
  );

  for (let start = 0; start < report.rows.length; start += INSERT_CHUNK) {
    await insertDailyRows(run, importId, report.rows.slice(start, start + INSERT_CHUNK));
  }

  return {
    id: importId,
    rowsImported: report.rows.length,
    rowsReplaced,
    firstDay: report.firstDay,
    lastDay: report.lastDay,
  };
}

/** Exclui um envio e as linhas dele que ainda estão em uso. Precisa rodar em transação. */
export async function deleteImport(run: AdsRunner, id: string): Promise<{ fileName: string } | null> {
  await run(WRITE_LOCK_SQL);
  const result = await run<{ file_name: string }>(
    `DELETE FROM ads_imports WHERE id = $1::uuid RETURNING file_name`,
    [id]
  );
  const row = result.rows[0];
  return row ? { fileName: row.file_name } : null;
}

type ImportRow = {
  id: string;
  file_name: string;
  file_size: number;
  file_format: string;
  account_ids: string[] | null;
  account_names: string[] | null;
  date_start: string;
  date_end: string;
  rows_imported: number;
  rows_replaced: number;
  rows_in_use: number;
  metrics: string[] | null;
  uploaded_by: string | null;
  created_at: unknown;
};

const METRIC_KEY_SET: ReadonlySet<string> = new Set<string>(ADS_METRIC_KEYS);

export async function listImports(run: AdsRunner): Promise<AdsImportItem[]> {
  const result = await run<ImportRow>(
    `SELECT i.id, i.file_name, i.file_size, i.file_format, i.account_ids, i.account_names,
            to_char(i.date_start, 'YYYY-MM-DD') AS date_start,
            to_char(i.date_end, 'YYYY-MM-DD') AS date_end,
            i.rows_imported, i.rows_replaced, i.metrics, i.created_at,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.email, '') AS uploaded_by,
            COALESCE(kept.rows_in_use, 0) AS rows_in_use
       FROM ads_imports i
       LEFT JOIN users u ON u.id = i.uploaded_by
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS rows_in_use FROM ads_daily WHERE import_id = i.id
       ) kept ON true
      ORDER BY i.created_at DESC
      LIMIT 200`
  );

  return result.rows.map((row) => {
    const rowsImported = Number(row.rows_imported) || 0;
    const rowsInUse = Number(row.rows_in_use) || 0;
    const status: AdsImportStatus =
      rowsInUse === 0 ? "replaced" : rowsInUse < rowsImported ? "partial" : "in_use";
    const names = (row.account_names ?? []).filter(Boolean);
    return {
      id: row.id,
      fileName: row.file_name,
      fileSize: Number(row.file_size) || 0,
      format: row.file_format,
      firstDay: row.date_start,
      lastDay: row.date_end,
      accounts: names.length > 0 ? names : (row.account_ids ?? []).filter(Boolean),
      rowsImported,
      rowsInUse,
      rowsReplaced: Number(row.rows_replaced) || 0,
      metrics: (row.metrics ?? []).filter((metric): metric is AdsMetricKey => METRIC_KEY_SET.has(metric)),
      status,
      uploadedBy: row.uploaded_by ?? "",
      createdAt: toIso(row.created_at),
    };
  });
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

async function loadRanking(
  run: AdsRunner,
  level: AdsRankingLevel,
  range: DayInterval,
  totalSpend: number | null
): Promise<AdsRanking> {
  const sql = LEVEL_SQL[level];
  const result = await run<RankingSqlRow>(
    `SELECT ${sql.key} AS entity_key,
            COALESCE(NULLIF(account_id, ''), account_name) AS account_key,
            (ARRAY_AGG(${sql.name} ORDER BY day DESC))[1] AS entity_name,
            (ARRAY_AGG(campaign_name ORDER BY day DESC))[1] AS campaign_name,
            (ARRAY_AGG(adset_name ORDER BY day DESC))[1] AS adset_name,
            (ARRAY_AGG(account_name ORDER BY day DESC))[1] AS account_name,
            ${AGGREGATE_COLUMNS}
       FROM ads_daily
      WHERE day BETWEEN $1::date AND $2::date
      GROUP BY 1, 2
      ORDER BY SUM(spend) DESC NULLS LAST, entity_name ASC
      LIMIT ${RANKING_LIMIT + 1}`,
    [range.from, range.to]
  );

  const rows = result.rows.slice(0, RANKING_LIMIT).map((row) => {
    const aggregate = readAggregate(row);
    const values = computeIndicators(aggregate);
    return {
      key: `${row.entity_key}\u001f${row.account_key}`,
      name: row.entity_name ?? "",
      campaign: level === "campaign" ? "" : row.campaign_name ?? "",
      adset: level === "ad" ? row.adset_name ?? "" : "",
      account: row.account_name || row.account_key || "",
      days: aggregate.days,
      spendShare:
        values.spend !== null && totalSpend !== null && totalSpend > 0 ? values.spend / totalSpend : null,
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
    previousRange: null,
    totals: emptyIndicators(),
    previous: null,
    rowsInRange: 0,
    daily: [],
    missingDays: 0,
    missingRanges: [],
    rankings: [],
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
 */
export async function loadDashboard(
  run: AdsRunner,
  query: { from: string | null; to: string | null },
  today: string
): Promise<AdsDashboardData> {
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

  const range =
    query.from && query.to
      ? { from: query.from, to: query.to }
      : resolvePresetRange("30d", coverage, today);
  const length = daysBetween(range.from, range.to) + 1;
  const previousRange = { from: addDays(range.from, -length), to: addDays(range.from, -1) };

  const currentResult = await run(
    `SELECT ${AGGREGATE_COLUMNS},
            (COUNT(*) FILTER (WHERE campaign_id <> '' OR campaign_name <> ''))::int AS with_campaign,
            (COUNT(*) FILTER (WHERE adset_id <> '' OR adset_name <> ''))::int AS with_adset,
            (COUNT(*) FILTER (WHERE ad_id <> '' OR ad_name <> ''))::int AS with_ad
       FROM ads_daily
      WHERE day BETWEEN $1::date AND $2::date`,
    [range.from, range.to]
  );
  const currentRow = currentResult.rows[0] ?? {};
  const current = readAggregate(currentRow);
  const totals = computeIndicators(current);

  const previousResult = await run(
    `SELECT ${AGGREGATE_COLUMNS} FROM ads_daily WHERE day BETWEEN $1::date AND $2::date`,
    [previousRange.from, previousRange.to]
  );
  const previousAggregate = readAggregate(previousResult.rows[0]);

  const dailyResult = await run<SqlRow & { day: string }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, ${AGGREGATE_COLUMNS}
       FROM ads_daily
      WHERE day BETWEEN $1::date AND $2::date
      GROUP BY day
      ORDER BY day`,
    [range.from, range.to]
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
      rankings.push(await loadRanking(run, level, range, totals.spend));
    }
  }

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
    range: { from: range.from, to: range.to, days: length },
    previousRange: previousAggregate.rows > 0 ? previousRange : null,
    totals,
    previous: previousAggregate.rows > 0 ? computeIndicators(previousAggregate) : null,
    rowsInRange: current.rows,
    daily,
    missingDays,
    missingRanges: missingRanges.slice(0, 5),
    rankings,
    accounts: accountsResult.rows.map((row) => row.account),
    resultTypes: resultTypesResult.rows.map((row) => row.result_type),
    currency: currencies[0] ?? "BRL",
    currencies,
    lastImport,
  };
}
