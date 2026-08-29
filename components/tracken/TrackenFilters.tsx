"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SHIPPING_MODE_OPTIONS } from "@/lib/tracken/shipping";
import type {
  PanelAttendant,
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
  { value: "no_deadline", label: "Sem limite" },
];

/** Sentinela do filtro de atendente para "ninguem assumiu". */
const UNASSIGNED = "unassigned";

const FIELD_CLASSES =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-colors focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/30";

const LABEL_CLASSES =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600";

type Props = {
  filters: PanelFilterState;
  carriers: PanelCarrier[];
  statuses: PanelStatus[];
  attendants: PanelAttendant[];
  unassignedOpen?: number;
  onChange: (patch: Partial<PanelFilterState>) => void;
  onReset: () => void;
};

export default function TrackenFilters({
  filters,
  carriers,
  statuses,
  attendants,
  unassignedOpen = 0,
  onChange,
  onReset,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.search);

  // Mantem o campo em sincronia quando o filtro e limpo por fora.
  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  // A busca so dispara depois que o usuario para de digitar, para nao gerar uma
  // consulta por tecla.
  useEffect(() => {
    if (searchDraft === filters.search) return;

    const timer = window.setTimeout(() => {
      onChange({ search: searchDraft });
    }, 400);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const activeCount =
    (filters.carrier ? 1 : 0) +
    (filters.status ? 1 : 0) +
    (filters.deadline !== "all" ? 1 : 0) +
    (filters.shippingMode ? 1 : 0) +
    (filters.attendant ? 1 : 0) +
    (filters.search ? 1 : 0) +
    (filters.assignedToMe ? 1 : 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className={LABEL_CLASSES} htmlFor="tracken-start">
            Periodo
          </label>
          {/* Empilha em telas estreitas: dois campos de data lado a lado em
              meia largura cortam o texto no navegador. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="tracken-start"
              type="date"
              value={filters.startDate}
              max={filters.endDate || undefined}
              onChange={(event) => onChange({ startDate: event.target.value })}
              className={FIELD_CLASSES}
            />
            <span className="hidden shrink-0 text-xs text-slate-500 sm:block">
              ate
            </span>
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

        <div>
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

        <div>
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

        <div>
          <label className={LABEL_CLASSES} htmlFor="tracken-attendant">
            Atendente
          </label>
          <select
            id="tracken-attendant"
            value={filters.attendant}
            onChange={(event) => onChange({ attendant: event.target.value })}
            className={FIELD_CLASSES}
          >
            <option value="">Todos</option>
            <option value={UNASSIGNED}>
              Nao atribuidos{unassignedOpen > 0 ? ` (${unassignedOpen})` : ""}
            </option>
            {attendants.map((attendant) => (
              <option key={attendant.id} value={attendant.id}>
                {attendant.name}
                {attendant.openTickets > 0 ? ` (${attendant.openTickets})` : ""}
                {attendant.isActive ? "" : " - inativo"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor="tracken-mode">
            Modalidade de Envio
          </label>
          <select
            id="tracken-mode"
            value={filters.shippingMode}
            onChange={(event) => onChange({ shippingMode: event.target.value })}
            className={FIELD_CLASSES}
          >
            <option value="">Todas</option>
            {SHIPPING_MODE_OPTIONS.map((mode) => (
              <option key={mode.code} value={mode.code}>
                {mode.label}
                {mode.isFlex ? " (FLEX)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
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

        <div className="sm:col-span-2">
          <label className={LABEL_CLASSES} htmlFor="tracken-search">
            Buscar
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
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
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 ${
                showAdvanced
                  ? "border-green-600 bg-green-50 text-green-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Mais
            </button>
          </div>
        </div>
      </div>

      {/* "Limpar" fora do bloco recolhivel: quem aplicou um filtro precisa ver
          como desfazer sem descobrir um botao escondido. */}
      {(activeCount > 0 || showAdvanced) && (
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
          {showAdvanced && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={filters.assignedToMe}
                onChange={(event) =>
                  onChange({ assignedToMe: event.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
              />
              Apenas meus atendimentos
            </label>
          )}

          {activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Limpar {activeCount} filtro{activeCount > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
