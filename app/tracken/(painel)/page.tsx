"use client";

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Inbox,
  Lightbulb,
  Loader2,
  RefreshCw,
  XCircle,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  CarrierDonut,
  SlaGauge,
  StatusBars,
  TrendLine,
} from "@/components/tracken/Charts";
import KpiCard from "@/components/tracken/KpiCard";
import Pagination from "@/components/tracken/Pagination";
import TicketDetailModal from "@/components/tracken/TicketDetailModal";
import TicketsTable from "@/components/tracken/TicketsTable";
import TrackenFilters from "@/components/tracken/TrackenFilters";
import { useTrackenCatalogs } from "@/components/tracken/useTrackenCatalogs";
import { usePanelTickets } from "@/components/tracken/usePanelTickets";
import type {
  PanelFilterState,
  SortState,
} from "@/components/tracken/panel-types";
import { formatNumber, formatPercent, toInputDate } from "@/lib/tracken/format";
import { FLEX_MODE } from "@/lib/tracken/shipping";

/** Icone de cada KPI de status. */
const STATUS_ICONS: Record<string, LucideIcon> = {
  recepcionado: Inbox,
  em_atendimento: Clock,
  removido: CheckCircle2,
  negado: XCircle,
  cancelado: XCircle,
};

const today = toInputDate();

const INITIAL_FILTERS: PanelFilterState = {
  startDate: today,
  endDate: today,
  carrier: "",
  status: "",
  deadline: "all",
  shippingMode: "",
  attendant: "",
  search: "",
  assignedToMe: false,
};

export default function TrackenPanelPage() {
  const [filters, setFilters] = useState<PanelFilterState>(INITIAL_FILTERS);
  const [sort, setSort] = useState<SortState>({
    sortBy: "deadline",
    sortDir: "asc",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  const { carriers, statuses, attendants, unassignedOpen, error: catalogError } =
    useTrackenCatalogs();

  const {
    tickets,
    stats,
    total,
    totalPages,
    isLoading,
    isRefreshing,
    error,
    queryString,
    reload,
  } = usePanelTickets({ filters, sort, page, pageSize, withStats: true });

  const handleFilterChange = (patch: Partial<PanelFilterState>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setPage(1);
  };

  const handleSortChange = (sortKey: string) => {
    setSort((previous) =>
      previous.sortBy === sortKey
        ? { sortBy: sortKey, sortDir: previous.sortDir === "asc" ? "desc" : "asc" }
        : { sortBy: sortKey, sortDir: "asc" }
    );
    setPage(1);
  };

  /** Troca de status a partir da propria linha da tabela. */
  const handleChangeStatus = useCallback(
    async (ticketId: string, nextStatus: string) => {
      const response = await fetch(`/api/tracken/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "status", status: nextStatus }),
      });

      const data = await response.json();
      if (!response.ok) {
        // O menu da linha mostra a mensagem; por isso propaga.
        throw new Error(data?.error?.message ?? "Falha ao alterar o status");
      }

      await reload({ silent: true });
    },
    [reload]
  );

  const kpiTotal = stats?.kpis.total ?? 0;
  const flexCount =
    stats?.charts.byShippingMode?.find((mode) => mode.code === FLEX_MODE)?.count ??
    0;
  const naoFlexCount = kpiTotal - flexCount;
  const periodLabel = (value: string) =>
    value ? value.split("-").reverse().join("/") : "-";

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Painel de Atendimento Fique no Verde Ja x TRACKen
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Gestao central dos atendimentos de remocao de atraso recebidos via
            TRACKen
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden="true" />
            {periodLabel(filters.startDate)} ate {periodLabel(filters.endDate)}
          </span>

          <button
            type="button"
            onClick={() => reload({ silent: true })}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            Atualizar
          </button>
        </div>
      </header>

      {(error || catalogError) && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error ?? catalogError}
        </p>
      )}

      {/* Atendimentos parados em status que saiu do mapa nao aparecem em card
          nenhum; avisar e melhor que deixar a soma nao fechar em silencio. */}
      {(stats?.kpis.unmappedStatusCount ?? 0) > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {formatNumber(stats?.kpis.unmappedStatusCount ?? 0)} atendimento(s) em
          status desativado nao aparecem nos cartoes abaixo. Reative o status em
          Configuracoes para voltar a acompanha-los.
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          title="Total Recebidos"
          value={kpiTotal}
          hint={`+${stats?.kpis.today ?? 0} hoje`}
          color="green"
          icon={CalendarDays}
          isActive={filters.status === ""}
          onClick={() => handleFilterChange({ status: "" })}
        />

        {(stats?.kpis.byStatus ?? []).map((status) => (
          <KpiCard
            key={status.code}
            title={status.label}
            value={status.count}
            hint={`${formatPercent(status.percentage)} do total`}
            color={status.color}
            icon={STATUS_ICONS[status.code] ?? Inbox}
            isActive={filters.status === status.code}
            onClick={() =>
              handleFilterChange({
                status: filters.status === status.code ? "" : status.code,
              })
            }
          />
        ))}
      </div>

      {/*
        Conferencia de FLEX: e a checagem que a operacao faz antes de abrir
        chamado, entao vira atalho de filtro.

        Renderiza sempre, mesmo antes dos numeros chegarem, para a tela nao
        saltar quando os dados carregam.
      */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiCard
          title="Envios FLEX"
          value={flexCount}
          hint={
            kpiTotal > 0
              ? `${formatPercent((flexCount / kpiTotal) * 100)} do total`
              : "Sem atendimentos no periodo"
          }
          color="green"
          icon={Zap}
          isActive={filters.shippingMode === FLEX_MODE}
          onClick={() =>
            handleFilterChange({
              shippingMode: filters.shippingMode === FLEX_MODE ? "" : FLEX_MODE,
            })
          }
        />
        <KpiCard
          title="Outras modalidades"
          value={Math.max(0, naoFlexCount)}
          hint="Conferir antes de abrir chamado"
          color="amber"
          icon={AlertTriangle}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-4">
        <CarrierDonut
          data={stats?.charts.byCarrier ?? []}
          total={stats?.charts.carrierTotal ?? 0}
        />
        <StatusBars data={stats?.charts.byStatus ?? []} />
        <TrendLine data={stats?.charts.trend ?? []} />
        <SlaGauge
          percentage={stats?.charts.sla.percentage ?? 0}
          target={stats?.charts.sla.target ?? 90}
          measured={stats?.charts.sla.measured ?? 0}
        />
      </div>

      <div className="mt-4">
        <TrackenFilters
          filters={filters}
          carriers={carriers}
          statuses={statuses}
          attendants={attendants}
          unassignedOpen={unassignedOpen}
          onChange={handleFilterChange}
          onReset={() =>
            setFilters({
              ...INITIAL_FILTERS,
              startDate: filters.startDate,
              endDate: filters.endDate,
            })
          }
        />
      </div>

      <div className="mt-4">
        <TicketsTable
          tickets={tickets}
          statuses={statuses}
          isLoading={isLoading}
          sort={sort}
          onSortChange={handleSortChange}
          onOpenTicket={(ticket) => setOpenTicketId(ticket.id)}
          onChangeStatus={handleChangeStatus}
        />
      </div>

      <div className="mt-4">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={(nextPage) =>
            setPage(Math.min(Math.max(1, nextPage), totalPages))
          }
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setPage(1);
          }}
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-xs text-slate-600">
          <Lightbulb
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
            aria-hidden="true"
          />
          <span>
            <span className="font-semibold text-slate-800">Dica:</span> clique no
            status de qualquer linha para alterar sem abrir tela nenhuma. A
            ordenacao padrao coloca o limite de envio mais proximo no topo.
          </span>
        </p>

        <button
          type="button"
          onClick={() => window.open(`/api/tracken/export?${queryString}`, "_blank")}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exportar Relatorio
        </button>
      </div>

      {openTicketId && (
        <TicketDetailModal
          ticketId={openTicketId}
          statuses={statuses}
          onClose={() => setOpenTicketId(null)}
          onUpdated={() => reload({ silent: true })}
        />
      )}
    </div>
  );
}
