import { formatCount, formatIndicator, formatPercent } from "./format";
import { ADS_INDICATORS, type AdsIndicatorKey } from "./metrics";
import type { AdsDailyPoint, AdsRanking, AdsRankingRow } from "./types";

/**
 * Utilitário de exportação de dados para CSV compatível com Excel no Brasil
 * (com BOM UTF-8 e separador de ponto e vírgula).
 */

function escapeCsvCell(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) return "";
  const str = String(cell);
  if (str.includes(";") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerDownload(content: string, fileName: string) {
  // BOM \uFEFF garante que o Microsoft Excel abra em UTF-8 com acentos corretos
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportRankingToCsv(
  ranking: AdsRanking,
  columns: { id: AdsIndicatorKey | "share" | "days" | "name"; label: string }[],
  currency: string,
  periodSlug: string
) {
  const levelLabels = {
    campaign: "Campanhas",
    adset: "Conjuntos",
    ad: "Anuncios",
  };
  const fileName = `ads-${levelLabels[ranking.level].toLowerCase()}-${periodSlug}.csv`;

  const headers = [
    levelLabels[ranking.level],
    "Conta",
    ...(ranking.level !== "campaign" ? ["Campanha"] : []),
    ...(ranking.level === "ad" ? ["Conjunto de Anúncios"] : []),
    ...columns.filter((c) => c.id !== "name").map((c) => c.label),
  ];

  const lines: string[] = [];
  lines.push(headers.map(escapeCsvCell).join(";"));

  for (const row of ranking.rows) {
    const line: (string | number | null)[] = [
      row.name || "Não informado",
      row.account || "",
      ...(ranking.level !== "campaign" ? [row.campaign || ""] : []),
      ...(ranking.level === "ad" ? [row.adset || ""] : []),
    ];

    for (const col of columns) {
      if (col.id === "name") continue;
      if (col.id === "share") {
        line.push(row.spendShare !== null ? formatPercent(row.spendShare * 100, 1) : "");
      } else if (col.id === "days") {
        line.push(row.days);
      } else {
        const val = row.values[col.id];
        line.push(val !== null ? formatIndicator(val, ADS_INDICATORS[col.id].format, currency) : "");
      }
    }

    lines.push(line.map(escapeCsvCell).join(";"));
  }

  triggerDownload(lines.join("\r\n"), fileName);
}

export function exportDailyToCsv(
  daily: AdsDailyPoint[],
  metrics: AdsIndicatorKey[],
  currency: string,
  periodSlug: string
) {
  const fileName = `ads-evolucao-diaria-${periodSlug}.csv`;
  const headers = ["Data", "Relatório Coberto", ...metrics.map((m) => ADS_INDICATORS[m].label)];

  const lines: string[] = [];
  lines.push(headers.map(escapeCsvCell).join(";"));

  for (const point of daily) {
    const line: (string | number | null)[] = [point.day, point.covered ? "Sim" : "Não"];
    for (const metric of metrics) {
      const val = point.values[metric];
      line.push(val !== null ? formatIndicator(val, ADS_INDICATORS[metric].format, currency) : "");
    }
    lines.push(line.map(escapeCsvCell).join(";"));
  }

  triggerDownload(lines.join("\r\n"), fileName);
}
