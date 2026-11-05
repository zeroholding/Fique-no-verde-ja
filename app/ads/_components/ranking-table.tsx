"use client";

import { useId, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Download,
  Search,
  X,
} from "lucide-react";

import { exportRankingToCsv } from "@/lib/ads/export";
import { formatCount, formatIndicator, formatPercent } from "@/lib/ads/format";
import {
  ADS_INDICATORS,
  ADS_INDICATOR_KEYS,
  type AdsIndicatorKey,
  type AdsIndicatorValues,
} from "@/lib/ads/metrics";
import type { AdsRanking, AdsRankingLevel, AdsRankingRow } from "@/lib/ads/types";

import { Button, Card, Dialog } from "./ui";
import { CreativeMedia, CreativeThumb as MiniCreative, CreativeFormatBadge } from "./creative-media";

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

const PAGE_SIZE = 25;

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
      columns.push({ id: "share", label: "Participação", title: "Fatia do investimento do período" });
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
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const result =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "pt-BR");
  return sort.direction === "asc" ? result : -result;
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
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className={`whitespace-nowrap px-3.5 py-3 font-semibold ${alignLeft ? "pl-5 text-left" : "text-right"}`}
    >
      <button
        type="button"
        onClick={() => onSort(column.id)}
        title={column.title}
        className={`group inline-flex cursor-pointer items-center gap-1.5 transition-colors ${
          active ? "font-bold text-blue-700" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        <span>{column.label}</span>
        <Icon
          className={`size-3.5 transition-opacity ${active ? "opacity-100 text-blue-600" : "opacity-40 group-hover:opacity-75"}`}
          aria-hidden
        />
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
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <span
            className="block h-full rounded-full bg-blue-600"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </span>
        <span className="font-semibold">{formatPercent(percent, 1)}</span>
      </span>
    );
  }
  if (column === "days") return <span className="font-medium text-slate-600">{formatCount(row.days)}</span>;
  if (column === "name") return null;
  return (
    <span className="font-semibold text-slate-800">
      {formatIndicator(row.values[column], ADS_INDICATORS[column].format, currency)}
    </span>
  );
}

/**
 * Miniatura do criativo.
 *
 * A URL vem do CDN da Meta e expira: quando falha, o espaço vira um ícone
 * neutro, nunca um quadrado quebrado.
 */
function CreativeThumb({ row, size = 40 }: { row: AdsRankingRow; size?: number }) {
  return <MiniCreative creative={row.creative} size={size} />;
}

/** Painel de detalhes: tudo o que existe daquele recorte, sem esconder nada. */
function RowDetail({
  row,
  level,
  currency,
  periodLabel,
  onClose,
}: {
  row: AdsRankingRow;
  level: AdsRankingLevel;
  currency: string;
  periodLabel: string;
  onClose: () => void;
}) {
  const present = ADS_INDICATOR_KEYS.filter((key) => row.values[key] !== null);

  return (
    <Dialog
      title={row.name || "Não informado"}
      description={`${LEVEL_LABELS[level].tab} · ${periodLabel}`}
      onClose={onClose}
      size="lg"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="w-full shrink-0 sm:w-[180px]">
            <CreativeMedia creative={row.creative} aspect="aspect-square" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-slate-500">
              {[row.campaign, row.adset].filter(Boolean).join(" › ") || "Sem hierarquia informada"}
            </p>
            {row.creative?.title ? (
              <p className="mt-1 text-[13.5px] font-bold text-slate-800">{row.creative.title}</p>
            ) : null}
            {row.creative?.body ? (
              <p className="mt-1 whitespace-pre-line text-[12.5px] font-medium leading-relaxed text-slate-500 line-clamp-4">
                {row.creative.body}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {row.creative ? <CreativeFormatBadge format={row.creative.format} /> : null}
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] font-semibold text-slate-700">
                {formatCount(row.days)} {row.days === 1 ? "dia no ar" : "dias no ar"}
              </span>
              {row.spendShare !== null ? (
                <span className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-[12px] font-semibold text-blue-700">
                  {formatPercent(row.spendShare * 100, 1)} do investimento
                </span>
              ) : null}
            </div>
            {row.creative?.permalinkUrl ? (
              <a
                href={row.creative.permalinkUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-blue-700 hover:underline"
              >
                Abrir no Gerenciador de Anúncios
              </a>
            ) : null}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {present.map((key) => {
            const definition = ADS_INDICATORS[key];
            return (
              <div key={key} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {definition.short}
                </dt>
                <dd className="mt-0.5 text-[15px] font-extrabold tabular-nums text-slate-900">
                  {formatIndicator(row.values[key], definition.format, currency)}
                </dd>
              </div>
            );
          })}
        </dl>

        {present.length === 0 ? (
          <p className="text-[13.5px] font-medium text-slate-500">
            Este recorte não tem métricas no período.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

export function RankingTable({
  rankings,
  totals,
  currency,
  periodLabel,
  periodSlug = "periodo",
}: {
  rankings: AdsRanking[];
  totals: AdsIndicatorValues;
  currency: string;
  periodLabel: string;
  periodSlug?: string;
}) {
  const titleId = useId();
  const searchId = useId();
  const [levelChoice, setLevelChoice] = useState<AdsRankingLevel | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>({ column: "spend", direction: "desc" });
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [detail, setDetail] = useState<AdsRankingRow | null>(null);

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

  const handleExport = () => {
    exportRankingToCsv({ ...ranking, rows: filtered }, columns, currency, periodSlug);
  };

  return (
    <Card aria-labelledby={titleId} className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/40 px-5 py-3.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id={titleId} className="text-[15.5px] font-bold tracking-tight text-slate-900">
            {labels.title}
          </h2>

          {rankings.length > 1 ? (
            <div
              role="group"
              aria-label="Nível de detalhamento"
              className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-xs"
            >
              {rankings.map((item) => {
                const selected = item.level === level;
                return (
                  <button
                    key={item.level}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => chooseLevel(item.level)}
                    className={`inline-flex h-7.5 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[12.5px] font-semibold transition-all ${
                      selected
                        ? "border border-blue-100 bg-blue-50 text-blue-700 shadow-xs"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <span>{LEVEL_LABELS[item.level].tab}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10.5px] font-bold ${selected ? "bg-blue-200/60 text-blue-800" : "bg-slate-100 text-slate-500"}`}
                    >
                      {item.rows.length}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              Buscar por nome
            </label>
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
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
              placeholder={`Filtrar ${labels.tab.toLowerCase()}…`}
              className="h-9 w-[220px] rounded-lg border border-slate-200 bg-white pl-8.5 pr-8 text-[13px] font-medium text-slate-800 shadow-xs transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-600"
                aria-label="Limpar busca"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <Button size="sm" variant="secondary" onClick={handleExport} className="gap-1.5" title="Exportar dados da tabela para CSV">
            <Download className="size-3.5 text-slate-500" aria-hidden />
            <span>Exportar CSV</span>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-[13px]">
          <thead className="border-b border-slate-200/90 bg-slate-50/80 text-[12px] uppercase tracking-wider text-slate-500">
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
          <tbody className="divide-y divide-slate-100">
            {shown.map((row) => (
              <tr
                key={row.key}
                className="group transition-colors hover:bg-slate-50/70"
              >
                <th scope="row" className="max-w-[360px] py-2.5 pl-5 pr-3 text-left font-normal">
                  <div className="flex items-center gap-3">
                    {level === "ad" ? <CreativeThumb row={row} /> : null}
                    <button
                      type="button"
                      onClick={() => setDetail(row)}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                      aria-label={`Ver detalhes de ${row.name || "registro sem nome"}`}
                    >
                      <span
                        className={`block truncate text-[13.5px] ${
                          row.name ? "font-bold text-slate-900 group-hover:text-blue-700" : "italic text-slate-400"
                        }`}
                        title={row.name || undefined}
                      >
                        {row.name || "Não informado"}
                      </span>

                      <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11.5px] font-medium text-slate-400">
                        {row.account ? (
                          <>
                            <span className="max-w-[130px] truncate text-slate-500">{row.account}</span>
                            <ChevronRight className="size-3 shrink-0 text-slate-300" aria-hidden />
                          </>
                        ) : null}
                        {level !== "campaign" && row.campaign ? (
                          <>
                            <span className="max-w-[150px] truncate text-slate-500">{row.campaign}</span>
                            {level === "ad" ? (
                              <ChevronRight className="size-3 shrink-0 text-slate-300" aria-hidden />
                            ) : null}
                          </>
                        ) : null}
                        {level === "ad" && row.adset ? (
                          <span className="max-w-[150px] truncate text-slate-500">{row.adset}</span>
                        ) : null}
                      </span>
                    </button>
                  </div>
                </th>
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-slate-800"
                  >
                    <CellValue row={row} column={column.id} currency={currency} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <div className="border-t border-slate-100 px-5 py-8 text-center text-[13.5px] font-medium text-slate-400">
          {term ? `Nenhum resultado encontrado para “${search.trim()}”.` : "Sem dados para este nível no período."}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-[12.5px] text-slate-500 sm:px-6">
          <span className="font-medium">
            Exibindo <strong className="font-semibold text-slate-800">{formatCount(shown.length)}</strong> de{" "}
            <strong className="font-semibold text-slate-800">{formatCount(rows.length)}</strong>
            {ranking.truncated ? " (limitado aos 500 maiores investimentos)" : ""}
          </span>
          {shown.length < rows.length ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setVisible((current) => current + PAGE_SIZE)}
              className="gap-1"
            >
              <span>Carregar mais</span>
              <ChevronDown className="size-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>
      ) : null}

      {detail ? (
        <RowDetail
          row={detail}
          level={level}
          currency={currency}
          periodLabel={periodLabel}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </Card>
  );
}
