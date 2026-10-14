import type { AdsMetricKey } from "./metrics";
import type { ParsedAdsReport } from "./report-rows";
import type { AdsImportPreview } from "./types";

/** Métricas que valem a pena pedir na próxima exportação quando não vieram. */
const SUGGESTED_METRICS: AdsMetricKey[] = ["link_clicks", "results"];

/** Resumo mostrado antes de salvar: o que o arquivo traz e o que muda no painel. */
export function buildImportPreview(
  report: ParsedAdsReport,
  file: { name: string; size: number; format: "csv" | "xlsx" },
  comparison: Pick<AdsImportPreview, "replacement" | "sameFile">
): AdsImportPreview {
  return {
    fileName: file.name,
    fileSize: file.size,
    format: file.format,
    firstDay: report.firstDay,
    lastDay: report.lastDay,
    days: report.days,
    rowsRead: report.rowsRead,
    rowsToSave: report.rows.length,
    rowsIgnored: report.rowsIgnored,
    accounts: report.accounts,
    counts: report.counts,
    metrics: report.metrics,
    missing: SUGGESTED_METRICS.filter((metric) => !report.metrics.includes(metric)),
    ignoredColumns: report.columns
      .filter((column) => column.usedAs === null && column.header !== "")
      .map((column) => column.header),
    currency: report.currency,
    totals: report.totals,
    replacement: comparison.replacement,
    sameFile: comparison.sameFile,
    warnings: report.warnings,
  };
}
