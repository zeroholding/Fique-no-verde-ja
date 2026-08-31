"use client";

import { CalendarClock, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SHIPPING_MODE_OPTIONS } from "@/lib/tracken/shipping";
import type {
  PanelAttendant,
  PanelCarrier,
  PanelFilterState,
  PanelStatus,
} from "./panel-types";

/**
 * Barra de ferramentas da grade.
 *
 * A busca e o periodo ficam sempre visiveis, porque sao o que se usa a toda
 * hora. Os recortes menos frequentes ficam atras de um botao, para a barra nao
 * empurrar a grade para baixo da dobra.
 *
 * Os filtros aplicados aparecem como fichas removiveis: da para ver o que esta
 * ativo e desfazer um por um, sem abrir o painel de novo.
 */

const DEADLINE_OPTIONS = [
  { value: "all", label: "Todos os prazos" },
  { value: "overdue", label: "Vencido" },
  { value: "today", label: "Vence hoje" },
  { value: "next_24h", label: "Próximas 24h" },
  { value: "next_48h", label: "Próximas 48h" },
  { value: "no_deadline", label: "Sem limite" },
];

const UNASSIGNED = "unassigned";

const FIELD =
  "w-full rounded-lg border border-[var(--tk-line-strong)] bg-white px-2.5 py-1.5 text-[12.5px] text-slate-800 transition-colors hover:border-slate-300";

const LABEL = "mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.04em] text-slate-500";

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

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  // A busca so dispara depois que o usuario para de digitar.
  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = window.setTimeout(() => onChange({ search: searchDraft }), 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  /** Fichas do que esta aplicado, cada uma removivel. */
  const chips: Array<{ label: string; clear: () => void }> = [];

  if (filters.carrier) {
    chips.push({
      label: `Transportadora: ${filters.carrier}`,
      clear: () => onChange({ carrier: "" }),
    });
  }
  if (filters.status) {
    chips.push({
      label: `Status: ${
        statuses.find((s) => s.code === filters.status)?.label ?? filters.status
      }`,
      clear: () => onChange({ status: "" }),
    });
  }
  if (filters.attendant) {
    chips.push({
      label: `Atendente: ${
        filters.attendant === UNASSIGNED
          ? "não atribuídos"
          : attendants.find((a) => a.id === filters.attendant)?.name ?? "—"
      }`,
      clear: () => onChange({ attendant: "" }),
    });
  }
  if (filters.shippingMode) {
    chips.push({
      label: `Modalidade: ${
        SHIPPING_MODE_OPTIONS.find((m) => m.code === filters.shippingMode)
          ?.label ?? filters.shippingMode
      }`,
      clear: () => onChange({ shippingMode: "" }),
    });
  }
  if (filters.deadline !== "all") {
    chips.push({
      label: `Prazo: ${
        DEADLINE_OPTIONS.find((d) => d.value === filters.deadline)?.label ?? ""
      }`,
      clear: () => onChange({ deadline: "all" }),
    });
  }
  if (filters.assignedToMe) {
    chips.push({
      label: "Apenas meus",
      clear: () => onChange({ assignedToMe: false }),
    });
  }
  if (filters.search) {
    chips.push({
      label: `Busca: "${filters.search}"`,
      clear: () => {
        setSearchDraft("");
        onChange({ search: "" });
      },
    });
  }

  return (
    <section className="tk-card tk-raised overflow-hidden">
      {/* ---------- Linha sempre visivel ---------- */}
      <div className="flex flex-col gap-2.5 p-3 sm:flex-row sm:items-end">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <label htmlFor="tk-search" className="sr-only">
            Buscar atendimento
          </label>
          <input
            id="tk-search"
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Buscar por ID de envio, venda, comprador ou seller"
            className="w-full rounded-lg border border-[var(--tk-line-strong)] bg-white py-2 pl-9 pr-3 text-[13px] text-slate-800 transition-colors placeholder:text-slate-400 hover:border-slate-300"
          />
        </div>

        {/*
          O periodo recorta pelo LIMITE DE ENVIO. Antes os dois campos vinham
          sem rotulo visivel (so `sr-only`), e "duas datas e uma seta" nao diz
          por qual data o recorte acontece. Agora o titulo esta na tela.

          A linha tambem deixou de ser `shrink-0`: com dois `input[type=date]`
          nativos (~140px cada no iOS) mais o botao, ela estourava a largura em
          telas de 320-360px.
        */}
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:gap-2">
          <div className="min-w-0">
            <span
              className="tk-eyebrow mb-1 flex items-center gap-1"
              id="tk-period-label"
            >
              <CalendarClock
                className="h-3 w-3 shrink-0 text-slate-400"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Limite de envio
            </span>

            <div
              className="flex min-w-0 items-center gap-1.5"
              role="group"
              aria-labelledby="tk-period-label"
            >
              <label htmlFor="tk-start" className="sr-only">
                Limite de envio a partir de
              </label>
              <input
                id="tk-start"
                type="date"
                value={filters.startDate}
                max={filters.endDate || undefined}
                onChange={(event) => onChange({ startDate: event.target.value })}
                className="tk-num min-w-0 flex-1 rounded-lg border border-[var(--tk-line-strong)] bg-white px-2.5 py-2 text-[12.5px] text-slate-800 transition-colors hover:border-slate-300 sm:flex-none"
              />
              <span className="shrink-0 text-[11px] text-slate-400" aria-hidden="true">
                →
              </span>
              <label htmlFor="tk-end" className="sr-only">
                Limite de envio até
              </label>
              <input
                id="tk-end"
                type="date"
                value={filters.endDate}
                min={filters.startDate || undefined}
                onChange={(event) => onChange({ endDate: event.target.value })}
                className="tk-num min-w-0 flex-1 rounded-lg border border-[var(--tk-line-strong)] bg-white px-2.5 py-2 text-[12.5px] text-slate-800 transition-colors hover:border-slate-300 sm:flex-none"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((previous) => !previous)}
            aria-expanded={showAdvanced}
            className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors ${
              showAdvanced || chips.length > 0
                ? "border-[var(--tk-brand)] bg-[var(--tk-brand-wash)] text-[var(--tk-brand-strong)]"
                : "border-[var(--tk-line-strong)] bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Filtros
            {chips.length > 0 && (
              <span className="tk-num ml-0.5 rounded bg-[var(--tk-brand-strong)] px-1.5 text-[10px] font-bold text-white">
                {chips.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ---------- Painel recolhivel ---------- */}
      {showAdvanced && (
        <div className="border-t border-[var(--tk-line)] bg-[var(--tk-surface-muted)] p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className={LABEL} htmlFor="tk-carrier">
                Transportadora
              </label>
              <select
                id="tk-carrier"
                value={filters.carrier}
                onChange={(event) => onChange({ carrier: event.target.value })}
                className={FIELD}
              >
                <option value="">Todas</option>
                {carriers.map((carrier) => (
                  <option key={carrier.code} value={carrier.code}>
                    {carrier.code} — {carrier.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL} htmlFor="tk-status">
                Status do atendimento
              </label>
              <select
                id="tk-status"
                value={filters.status}
                onChange={(event) => onChange({ status: event.target.value })}
                className={FIELD}
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
              <label className={LABEL} htmlFor="tk-attendant">
                Atendente
              </label>
              <select
                id="tk-attendant"
                value={filters.attendant}
                onChange={(event) => onChange({ attendant: event.target.value })}
                className={FIELD}
              >
                <option value="">Todos</option>
                <option value={UNASSIGNED}>
                  Não atribuídos
                  {unassignedOpen > 0 ? ` (${unassignedOpen})` : ""}
                </option>
                {attendants.map((attendant) => (
                  <option key={attendant.id} value={attendant.id}>
                    {attendant.name}
                    {attendant.openTickets > 0 ? ` (${attendant.openTickets})` : ""}
                    {attendant.isActive ? "" : " — inativo"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL} htmlFor="tk-mode">
                Modalidade de envio
              </label>
              <select
                id="tk-mode"
                value={filters.shippingMode}
                onChange={(event) =>
                  onChange({ shippingMode: event.target.value })
                }
                className={FIELD}
              >
                <option value="">Todas</option>
                {SHIPPING_MODE_OPTIONS.map((mode) => (
                  <option key={mode.code} value={mode.code}>
                    {mode.label}
                    {mode.isFlex ? " — entrega própria" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL} htmlFor="tk-deadline">
                Limite de envio
              </label>
              <select
                id="tk-deadline"
                value={filters.deadline}
                onChange={(event) => onChange({ deadline: event.target.value })}
                className={FIELD}
              >
                {DEADLINE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 py-1.5 text-[12.5px] text-slate-700">
                <input
                  type="checkbox"
                  checked={filters.assignedToMe}
                  onChange={(event) =>
                    onChange({ assignedToMe: event.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-[var(--tk-brand-strong)]"
                />
                Apenas meus atendimentos
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Fichas do que esta aplicado ---------- */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--tk-line)] px-3 py-2.5">
          {chips.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 py-1 pl-2 pr-1 text-[11.5px] font-medium text-slate-700"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.clear}
                className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-800"
                aria-label={`Remover filtro ${chip.label}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}

          <button
            type="button"
            onClick={onReset}
            className="ml-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            Limpar tudo
          </button>
        </div>
      )}
    </section>
  );
}
