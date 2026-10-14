"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";

import { formatCount, formatIndicator, formatPercent } from "@/lib/ads/format";
import { ADS_INDICATORS, type AdsIndicatorKey, type AdsIndicatorValues } from "@/lib/ads/metrics";
import type { AdsRanking, AdsRankingLevel, AdsRankingRow } from "@/lib/ads/types";

import { Button, Card } from "./ui";

/**
 * Tabela de desempenho por campanha, conjunto ou anúncio. Só aparecem os
 * níveis e as colunas que os relatórios enviados permitem.
 */

const TABLE_PRIORITY: AdsIndicatorKey[] = [
  "spend",
  "results",
  "cost_per_result",
  "conversations",
  "cost_per_conversation",
  "leads",
  "cost_per_lead",
  "purchases",
  "purchase_value",
  "roas",
  "link_clicks",
  "cpc",
  "ctr",
  "impressions",
  "cpm",
  "reach_per_day",
];

const LEVEL_LABELS: Record<AdsRankingLevel, { tab: string; title: string; column: string }> = {
  campaign: { tab: "Campanhas", title: "Desempenho por campanha", column: "Campanha" },
  adset: { tab: "Conjuntos", title: "Desempenho por conjunto de anúncios", column: "Conjunto" },
  ad: { tab: "Anúncios", title: "Desempenho por anúncio", column: "Anúncio" },
};

const PAGE_SIZE = 20;

type ColumnId = AdsIndicatorKey | "share" | "days" | "name";
type SortState = { column: ColumnId; direction: "asc" | "desc" };

type Column = { id: ColumnId; label: string; title?: string };

function buildColumns(totals: AdsIndicatorValues): Column[] {
  const columns: Column[] = [];
  for (const key of TABLE_PRIORITY) {
    if (totals[key] === null) continue;
    const definition = ADS_INDICATORS[key];
    columns.push({ id: key, label: definition.short, title: definition.label });
    if (key === "spend") {
      columns.push({ id: "share", label: "Participação", title: "Parte do investimento do período" });
    }
  }
  columns.push({ id: "days", label: "Dias no ar", title: "Dias com veiculação no período" });
  return columns;
}

const normalize = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function sortValue(row: AdsRankingRow, column: ColumnId): number | string | null {
  if (column === "name") return row.name ? normalize(row.name) : null;
  if (column === "share") return row.spendShare;
  if (column === "days") return row.days;
  return row.values[column];
}

function compareRows(left: AdsRankingRow, right: AdsRankingRow, sort: SortState): number {
  const a = sortValue(left, sort.column);
  const b = sortValue(right, sort.column);
  // Sem valor vai sempre para o fim, nos dois sentidos.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const result =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "pt-BR");
  return sort.direction === "asc" ? result : -result;
}

function contextLine(row: AdsRankingRow, level: AdsRankingLevel, showAccount: boolean): string {
  const parts: string[] = [];
  if (showAccount && row.account) parts.push(row.account);
  if (level !== "campaign" && row.campaign) parts.push(row.campaign);
  if (level === "ad" && row.adset) parts.push(row.adset);
  return parts.join(" › ");
}

function SortableHeader({
  column,
  sort,
  onSort,
  alignLeft = false,
}: {
  column: Column;
  sort: SortState;
  onSort: (column: ColumnId) => void;
  alignLeft?: boolean;
}) {
  const active = sort.column === column.id;
  const Icon = sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className={`whitespace-nowrap px-3 py-2 font-medium ${alignLeft ? "pl-4 text-left sm:pl-5" : "text-right"}`}
    >
      <button
        type="button"
        onClick={() => onSort(column.id)}
        title={column.title}
        className={`inline-flex items-center gap-1 rounded hover:text-[var(--ads-ink)] ${
          active ? "text-[var(--ads-ink)]" : ""
        }`}
      >
        {column.label}
        {active ? <Icon className="size-3.5" aria-hidden /> : null}
      </button>
    </th>
  );
}

function CellValue({ row, column, currency }: { row: AdsRankingRow; column: ColumnId; currency: string }) {
  if (column === "share") {
    if (row.spendShare === null) return <>—</>;
    const percent = row.spendShare * 100;
    return (
      <span className="inline-flex items-center justify-end gap-2">
        <span className="h-1.5 w-14 overflow-hidden rounded-full bg-[#eef0f3]" aria-hidden>
          <span
            className="block h-full rounded-full bg-[var(--ads-blue)]"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </span>
        {formatPercent(percent, 1)}
      </span>
    );
  }
  if (column === "days") return <>{formatCount(row.days)}</>;
  if (column === "name") return null;
  return <>{formatIndicator(row.values[column], ADS_INDICATORS[column].format, currency)}</>;
}

export function RankingTable({
  rankings,
  totals,
  currency,
  showAccount,
}: {
  rankings: AdsRanking[];
  totals: AdsIndicatorValues;
  currency: string;
  showAccount: boolean;
}) {
  const titleId = useId();
  const searchId = useId();
  const [levelChoice, setLevelChoice] = useState<AdsRankingLevel | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>({ column: "spend", direction: "desc" });
  const [visible, setVisible] = useState(PAGE_SIZE);

  const ranking = rankings.find((item) => item.level === levelChoice) ?? rankings[0];
  if (!ranking) return null;
  const level = ranking.level;
  const labels = LEVEL_LABELS[level];
  const columns = buildColumns(totals);
  const activeSort: SortState =
    sort.column === "name" || columns.some((column) => column.id === sort.column)
      ? sort
      : { column: columns[0]?.id ?? "days", direction: "desc" };

  const term = normalize(search.trim());
  const filtered = term
    ? ranking.rows.filter((row) =>
        normalize([row.name, row.campaign, row.adset, row.account].join(" ")).includes(term)
      )
    : ranking.rows;
  const rows = [...filtered].sort((left, right) => compareRows(left, right, activeSort));
  const shown = rows.slice(0, visible);

  const handleSort = (column: ColumnId) => {
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
        : { column, direction: column === "name" ? "asc" : "desc" }
    );
  };

  const chooseLevel = (next: AdsRankingLevel) => {
    setLevelChoice(next);
    setVisible(PAGE_SIZE);
  };

  return (
    <Card aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ads-line)] px-4 py-3 sm:px-5">
        <h2 id={titleId} className="text-[15px] font-semibold text-[var(--ads-ink)]">
          {labels.title}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {rankings.length > 1 ? (
            <div
              role="group"
              aria-label="Ver por"
              className="inline-flex rounded-md border border-[var(--ads-line-strong)] bg-white p-0.5"
            >
              {rankings.map((item) => {
                const selected = item.level === level;
                return (
                  <button
                    key={item.level}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => chooseLevel(item.level)}
                    className={`h-7 rounded px-2.5 text-[13px] font-medium transition-colors ${
                      selected
                        ? "bg-[#eef0f3] text-[var(--ads-ink)]"
                        : "text-[var(--ads-ink-muted)] hover:text-[var(--ads-ink)]"
                    }`}
                  >
                    {LEVEL_LABELS[item.level].tab}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              Buscar por nome
            </label>
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--ads-ink-muted)]"
              aria-hidden
            />
            <input
              id={searchId}
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setVisible(PAGE_SIZE);
              }}
              placeholder="Buscar por nome"
              className="h-9 w-[220px] rounded-md border border-[var(--ads-line-strong)] bg-white pl-8 pr-2.5 text-[14px] text-[var(--ads-ink)] placeholder:text-[var(--ads-ink-muted)]"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
          <thead className="bg-[var(--ads-subtle)] text-[12.5px] text-[var(--ads-ink-soft)]">
            <tr>
              <SortableHeader
                column={{ id: "name", label: labels.column }}
                sort={activeSort}
                onSort={handleSort}
                alignLeft
              />
              {columns.map((column) => (
                <SortableHeader key={column.id} column={column} sort={activeSort} onSort={handleSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const context = contextLine(row, level, showAccount);
              return (
                <tr key={row.key} className="border-t border-[var(--ads-line)] hover:bg-[var(--ads-subtle)]">
                  <th scope="row" className="max-w-[340px] py-2.5 pl-4 pr-3 text-left font-normal sm:pl-5">
                    <span
                      className={`block truncate ${
                        row.name ? "font-medium text-[var(--ads-ink)]" : "italic text-[var(--ads-ink-muted)]"
                      }`}
                      title={row.name || undefined}
                    >
                      {row.name || "Não informado"}
                    </span>
                    {context ? (
                      <span className="mt-0.5 block truncate text-[12px] text-[var(--ads-ink-muted)]" title={context}>
                        {context}
                      </span>
                    ) : null}
                  </th>
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className="whitespace-nowrap px-3 py-2.5 text-right text-[var(--ads-ink)] tabular-nums"
                    >
                      <CellValue row={row} column={column.id} currency={currency} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <p className="border-t border-[var(--ads-line)] px-5 py-6 text-center text-[13.5px] text-[var(--ads-ink-muted)]">
          {term ? `Nada encontrado para “${search.trim()}”.` : "Sem linhas neste período."}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ads-line)] px-4 py-2.5 text-[12.5px] text-[var(--ads-ink-muted)] sm:px-5">
          <span>
            Mostrando {formatCount(shown.length)} de {formatCount(rows.length)}
            {ranking.truncated ? " (os 500 com maior investimento)" : ""}
          </span>
          {shown.length < rows.length ? (
            <Button size="sm" onClick={() => setVisible((current) => current + PAGE_SIZE)}>
              Mostrar mais
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
