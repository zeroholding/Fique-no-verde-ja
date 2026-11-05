"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Columns3,
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

import { CreativeFormatBadge, CreativeMedia, CreativeThumb } from "./creative-media";
import { Button, Card, Dialog } from "./ui";

/**
 * Tabela de desempenho por campanha, conjunto e anúncio.
 *
 * Regra desta tela: NADA de rolagem horizontal. A tabela antiga tinha largura
 * mínima de 700px e nove colunas — no telão ela cortava o fim e obrigava a
 * arrastar para o lado. Agora a pessoa escolhe as colunas que quer ver, e o
 * padrão é curto de propósito: investimento, participação, resultados, custo
 * por resultado e CTR.
 *
 * A conta saiu da hierarquia de cada linha: ela é única no módulo, então
 * repetir "45252134449595821, BRL" em toda linha era ruído puro ocupando
 * largura.
 */

const TABLE_PRIORITY: AdsIndicatorKey[] = [
  "spend",
  "results",
  "cost_per_result",
  "ctr",
  "conversations",
  "cost_per_conversation",
  "leads",
  "cost_per_lead",
  "purchases",
  "purchase_value",
  "roas",
  "link_clicks",
  "cpc",
  "all_clicks",
  "landing_page_views",
  "impressions",
  "cpm",
  "reach_per_day",
];

/** Colunas visíveis na primeira visita: cabe sem rolar em qualquer tela. */
const DEFAULT_COLUMNS: ColumnId[] = ["spend", "share", "results", "cost_per_result", "ctr"];

const LEVEL_LABELS: Record<AdsRankingLevel, { tab: string; title: string; column: string }> = {
  campaign: { tab: "Campanhas", title: "Desempenho por campanha", column: "Campanha" },
  adset: { tab: "Conjuntos", title: "Desempenho por conjunto de anúncios", column: "Conjunto" },
  ad: { tab: "Anúncios", title: "Desempenho por anúncio", column: "Anúncio" },
};

const PAGE_SIZE = 25;
const STORAGE_KEY = "ads:colunas";

type ColumnId = AdsIndicatorKey | "share" | "days";
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

function sortValue(row: AdsRankingRow, column: ColumnId): number | null {
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
  return sort.direction === "asc" ? a - b : b - a;
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
      className={`whitespace-nowrap px-2.5 py-2.5 text-[11.5px] font-bold uppercase tracking-wider ${
        alignLeft ? "pl-4 text-left" : "text-right"
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(column.id)}
        title={column.title}
        className={`group inline-flex cursor-pointer items-center gap-1 transition-colors ${
          active ? "text-blue-700" : "text-slate-500 hover:text-slate-800"
        }`}
      >
        <span>{column.label}</span>
        <Icon
          className={`size-3 transition-opacity ${active ? "opacity-100" : "opacity-30 group-hover:opacity-70"}`}
          aria-hidden
        />
      </button>
    </th>
  );
}

function CellValue({ row, column, currency }: { row: AdsRankingRow; column: ColumnId; currency: string }) {
  if (column === "share") {
    if (row.spendShare === null) return <span className="text-slate-300">—</span>;
    const percent = row.spendShare * 100;
    return (
      <span className="inline-flex items-center justify-end gap-1.5">
        <span className="hidden h-1.5 w-10 overflow-hidden rounded-full bg-slate-100 sm:block" aria-hidden>
          <span
            className="block h-full rounded-full bg-blue-600"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </span>
        <span className="font-semibold text-slate-600">{formatPercent(percent, 1)}</span>
      </span>
    );
  }
  if (column === "days") return <span className="font-medium text-slate-600">{formatCount(row.days)}</span>;
  return (
    <span className="font-semibold tabular-nums text-slate-800">
      {formatIndicator(row.values[column], ADS_INDICATORS[column].format, currency)}
    </span>
  );
}

/** Painel de detalhes: a peça grande e todos os números do recorte. */
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
          <div className="w-full shrink-0 sm:w-[190px]">
            <CreativeMedia creative={row.creative} aspect="aspect-square" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-slate-500">
              {[row.campaign, row.adset].filter(Boolean).join(" › ") || "Sem campanha informada"}
            </p>
            {row.creative?.title ? (
              <p className="mt-1 text-[13.5px] font-bold text-slate-800">{row.creative.title}</p>
            ) : null}
            {row.creative?.body ? (
              <p className="mt-1 line-clamp-4 whitespace-pre-line text-[12.5px] font-medium leading-relaxed text-slate-500">
                {row.creative.body}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.creative ? <CreativeFormatBadge format={row.creative.format} /> : null}
              <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">
                {formatCount(row.days)} {row.days === 1 ? "dia no ar" : "dias no ar"}
              </span>
              {row.spendShare !== null ? (
                <span className="rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold text-blue-700">
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

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {present.map((key) => {
            const definition = ADS_INDICATORS[key];
            return (
              <div key={key} className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2">
                <dt className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  {definition.short}
                </dt>
                <dd className="mt-0.5 text-[14.5px] font-extrabold tabular-nums text-slate-900">
                  {formatIndicator(row.values[key], definition.format, currency)}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </Dialog>
  );
}

/** Seletor de colunas: evita a rolagem horizontal deixando a pessoa escolher. */
function ColumnPicker({
  columns,
  visible,
  onToggle,
  onReset,
}: {
  columns: Column[];
  visible: ColumnId[];
  onToggle: (id: ColumnId) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setOpen((current) => !current)}
        className="gap-1.5"
        aria-expanded={open}
        aria-haspopup="true"
        title="Escolher quais números aparecem na tabela"
      >
        <Columns3 className="size-3.5 text-slate-500" aria-hidden />
        <span>Colunas</span>
        <span className="rounded bg-slate-100 px-1 text-[10.5px] font-bold text-slate-600">
          {visible.length}
        </span>
      </Button>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-[230px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <p className="px-2 py-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
            Mostrar na tabela
          </p>
          <ul className="max-h-[280px] overflow-y-auto">
            {columns.map((column) => {
              const checked = visible.includes(column.id);
              return (
                <li key={column.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(column.id)}
                      className="size-3.5 accent-blue-600"
                    />
                    <span className="truncate" title={column.title}>
                      {column.label}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={onReset}
            className="mt-1 w-full cursor-pointer rounded-md border-t border-slate-100 px-2 py-1.5 text-left text-[12px] font-bold text-slate-500 hover:text-slate-800"
          >
            Voltar ao padrão
          </button>
        </div>
      ) : null}
    </div>
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
  const [chosen, setChosen] = useState<ColumnId[]>(DEFAULT_COLUMNS);

  // A escolha de colunas sobrevive ao recarregamento: quem tirou "Impressões"
  // não quer tê-la de volta a cada visita.
  //
  // A leitura precisa acontecer DEPOIS da montagem: no servidor não existe
  // localStorage, e ler no inicializador do `useState` quebraria a renderização
  // no servidor. Por isso o efeito, mesmo com a regra apontando o contrário.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as ColumnId[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- preferência salva no navegador, lida uma vez na montagem
        setChosen(parsed);
      }
    } catch {
      // Sem preferência salva: segue o padrão.
    }
  }, []);

  const persist = (next: ColumnId[]) => {
    setChosen(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Armazenamento cheio ou bloqueado: a sessão continua com a escolha em memória.
    }
  };

  const ranking = rankings.find((item) => item.level === levelChoice) ?? rankings[0];
  if (!ranking) return null;
  const level = ranking.level;
  const labels = LEVEL_LABELS[level];
  const allColumns = buildColumns(totals);
  const columns = allColumns.filter((column) => chosen.includes(column.id));
  const shownColumns = columns.length > 0 ? columns : allColumns.slice(0, 4);

  const activeSort: SortState = shownColumns.some((column) => column.id === sort.column)
    ? sort
    : { column: shownColumns[0]?.id ?? "days", direction: "desc" };

  const term = normalize(search.trim());
  const filtered = term
    ? ranking.rows.filter((row) =>
        normalize([row.name, row.campaign, row.adset].join(" ")).includes(term)
      )
    : ranking.rows;
  const rows = [...filtered].sort((left, right) => compareRows(left, right, activeSort));
  const shown = rows.slice(0, visible);

  const handleSort = (column: ColumnId) => {
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "desc" }
    );
  };

  const chooseLevel = (next: AdsRankingLevel) => {
    setLevelChoice(next);
    setVisible(PAGE_SIZE);
  };

  const handleExport = () => {
    exportRankingToCsv({ ...ranking, rows: filtered }, shownColumns, currency, periodSlug);
  };

  return (
    <Card aria-labelledby={titleId} className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 bg-slate-50/40 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 id={titleId} className="text-[15px] font-bold tracking-tight text-slate-900">
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
                    className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2.5 text-[12px] font-semibold transition-all ${
                      selected
                        ? "border border-blue-100 bg-blue-50 text-blue-700 shadow-xs"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <span>{LEVEL_LABELS[item.level].tab}</span>
                    <span
                      className={`rounded-full px-1 text-[10px] font-bold ${
                        selected ? "bg-blue-200/60 text-blue-800" : "bg-slate-100 text-slate-500"
                      }`}
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
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
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
              placeholder="Filtrar…"
              className="h-8 w-[150px] rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-[12.5px] font-medium text-slate-800 shadow-xs transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-600"
                aria-label="Limpar busca"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>

          <ColumnPicker
            columns={allColumns}
            visible={shownColumns.map((column) => column.id)}
            onToggle={(id) => {
              const has = chosen.includes(id);
              const next = has ? chosen.filter((item) => item !== id) : [...chosen, id];
              persist(next.length > 0 ? next : DEFAULT_COLUMNS);
            }}
            onReset={() => persist(DEFAULT_COLUMNS)}
          />

          <Button
            size="sm"
            variant="secondary"
            onClick={handleExport}
            className="gap-1.5"
            title="Exportar a tabela para CSV"
          >
            <Download className="size-3.5 text-slate-500" aria-hidden />
            <span className="hidden sm:inline">Exportar</span>
          </Button>
        </div>
      </div>

      <table className="w-full table-auto border-collapse text-[13px]">
        <thead className="border-b border-slate-200/90 bg-slate-50/60">
          <tr>
            <th
              scope="col"
              className="py-2.5 pl-4 pr-2 text-left text-[11.5px] font-bold uppercase tracking-wider text-slate-500"
            >
              {labels.column}
            </th>
            {shownColumns.map((column) => (
              <SortableHeader key={column.id} column={column} sort={activeSort} onSort={handleSort} />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {shown.map((row) => (
            <tr key={row.key} className="group transition-colors hover:bg-slate-50/70">
              <th scope="row" className="w-full max-w-0 py-2.5 pl-4 pr-2 text-left font-normal">
                <div className="flex items-center gap-2.5">
                  {level === "ad" ? <CreativeThumb creative={row.creative} size={36} /> : null}
                  <button
                    type="button"
                    onClick={() => setDetail(row)}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                    aria-label={`Ver detalhes de ${row.name || "registro sem nome"}`}
                  >
                    <span
                      className={`block truncate text-[13px] ${
                        row.name
                          ? "font-bold text-slate-900 group-hover:text-blue-700"
                          : "italic text-slate-400"
                      }`}
                      title={row.name || undefined}
                    >
                      {row.name || "Não informado"}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-slate-400">
                      <span className="max-w-[220px] truncate" title={[row.campaign, row.adset].filter(Boolean).join(" › ")}>
                        {[row.campaign, row.adset].filter(Boolean).join(" › ") || "Sem campanha"}
                      </span>
                      <ChevronRight className="size-2.5 shrink-0 text-slate-300" aria-hidden />
                    </span>
                  </button>
                </div>
              </th>
              {shownColumns.map((column) => (
                <td
                  key={column.id}
                  className="whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums"
                >
                  <CellValue row={row} column={column.id} currency={currency} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 ? (
        <div className="border-t border-slate-100 px-5 py-8 text-center text-[13px] font-medium text-slate-400">
          {term ? `Nenhum resultado para “${search.trim()}”.` : "Sem dados para este nível no período."}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-[12px] text-slate-500 sm:px-5">
          <span className="font-medium">
            Exibindo <strong className="font-semibold text-slate-800">{formatCount(shown.length)}</strong> de{" "}
            <strong className="font-semibold text-slate-800">{formatCount(rows.length)}</strong>
            {ranking.truncated ? " (limitado aos 500 maiores)" : ""}
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
