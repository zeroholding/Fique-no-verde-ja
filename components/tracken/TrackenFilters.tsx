"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  PanelCarrier,
  PanelFilterState,
  PanelStatus,
} from "./panel-types";

const DEADLINE_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "overdue", label: "Vencido" },
  { value: "today", label: "Vence hoje" },
  { value: "next_24h", label: "Proximas 24h" },
  { value: "next_48h", label: "Proximas 48h" },
];

const FIELD_CLASSES =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-green-500 focus:ring-2 focus:ring-green-100";

const LABEL_CLASSES =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500";

type Props = {
  filters: PanelFilterState;
  carriers: PanelCarrier[];
  statuses: PanelStatus[];
  onChange: (patch: Partial<PanelFilterState>) => void;
  onReset: () => void;
};

export default function TrackenFilters({
  filters,
  carriers,
  statuses,
  onChange,
  onReset,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.search);

  // Mantem o campo em sincronia quando o filtro e limpo por fora.
  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  // A busca so dispara depois que o usuario para de digitar, para nao
  // gerar uma consulta por tecla.
  useEffect(() => {
    if (searchDraft === filters.search) return;

    const timer = window.setTimeout(() => {
      onChange({ search: searchDraft });
    }, 400);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const hasActiveFilters =
    filters.carrier !== "" ||
    filters.status !== "" ||
    filters.deadline !== "all" ||
    filters.search !== "" ||
    filters.assignedToMe;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
        <div className="xl:col-span-3">
          <label className={LABEL_CLASSES} htmlFor="tracken-start">
            Periodo
          </label>
          <div className="flex items-center gap-2">
            <input
              id="tracken-start"
              type="date"
              value={filters.startDate}
              max={filters.endDate || undefined}
              onChange={(event) => onChange({ startDate: event.target.value })}
              className={FIELD_CLASSES}
            />
            <span className="text-xs text-slate-400">ate</span>
            <input
              type="date"
              aria-label="Data final do periodo"
              value={filters.endDate}
              min={filters.startDate || undefined}
              onChange={(event) => onChange({ endDate: event.target.value })}
              className={FIELD_CLASSES}
            />
          </div>
        </div>

        <div className="xl:col-span-2">
          <label className={LABEL_CLASSES} htmlFor="tracken-carrier">
            Transportadora
          </label>
          <select
            id="tracken-carrier"
            value={filters.carrier}
            onChange={(event) => onChange({ carrier: event.target.value })}
            className={FIELD_CLASSES}
          >
            <option value="">Todas</option>
            {carriers.map((carrier) => (
              <option key={carrier.code} value={carrier.code}>
                {carrier.code} - {carrier.name}
              </option>
            ))}
          </select>
        </div>

        <div className="xl:col-span-2">
          <label className={LABEL_CLASSES} htmlFor="tracken-status">
            Status Atendimento
          </label>
          <select
            id="tracken-status"
            value={filters.status}
            onChange={(event) => onChange({ status: event.target.value })}
            className={FIELD_CLASSES}
          >
            <option value="">Todos</option>
            {statuses.map((status) => (
              <option key={status.code} value={status.code}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        <div className="xl:col-span-2">
          <label className={LABEL_CLASSES} htmlFor="tracken-deadline">
            Limite de Envio
          </label>
          <select
            id="tracken-deadline"
            value={filters.deadline}
            onChange={(event) => onChange({ deadline: event.target.value })}
            className={FIELD_CLASSES}
          >
            {DEADLINE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="xl:col-span-3">
          <label className={LABEL_CLASSES} htmlFor="tracken-search">
            Buscar
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="tracken-search"
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="ID de envio, venda, comprador, seller..."
                className={`${FIELD_CLASSES} pl-9`}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced((previous) => !previous)}
              aria-expanded={showAdvanced}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                showAdvanced
                  ? "border-green-500 bg-green-50 text-green-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filtros
            </button>
          </div>
        </div>
      </div>

      {showAdvanced && (
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={filters.assignedToMe}
              onChange={(event) =>
                onChange({ assignedToMe: event.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-200"
            />
            Apenas meus atendimentos
          </label>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Limpar filtros
            </button>
          )}
        </div>
      )}
    </section>
  );
}
