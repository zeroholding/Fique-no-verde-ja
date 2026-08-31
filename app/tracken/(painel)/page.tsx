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
import {
  PrimaryButton,
  SecondaryButton,
  kpiGridClass,
} from "@/components/tracken/PageShell";
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
    async (
      ticketId: string,
      nextStatus: string,
      denialReason?: string | null
    ) => {
      const response = await fetch(`/api/tracken/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "status",
          status: nextStatus,
          // Obrigatorio ao negar; a API recusa a negativa sem ele.
          denialReason: denialReason ?? null,
        }),
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
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-slate-900 sm:text-[22px]">
            Painel de Atendimento
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500">
            Solicitações de remoção de atraso recebidas da TRACKen, ordenadas pelo
            limite de envio do Mercado Livre.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Diz por qual data o periodo recorta; antes eram duas datas soltas
              e nao dava para saber se era recebimento ou limite. */}
          <span
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--tk-line)] bg-white px-2.5 py-2 text-[12px] text-slate-600"
            title="Periodo filtrado pelo limite de envio"
          >
            <CalendarDays
              className="h-[15px] w-[15px] shrink-0 text-slate-400"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span className="hidden text-slate-500 sm:inline">Limite:</span>
            <span className="tk-num">
              {periodLabel(filters.startDate)} — {periodLabel(filters.endDate)}
            </span>
          </span>

          <SecondaryButton
            type="button"
            onClick={() =>
              window.open(`/api/tracken/export?${queryString}`, "_blank")
            }
          >
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Exportar
          </SecondaryButton>

          <PrimaryButton
            type="button"
            onClick={() => reload({ silent: true })}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            )}
            Atualizar
          </PrimaryButton>
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

      {/* A grade acompanha a quantidade de cartoes (1 fixo + status ativos),
          senao um cartao fica sozinho na linha de baixo. */}
      <div
        className={`mt-6 grid gap-3 ${kpiGridClass(
          1 + (stats?.kpis.byStatus?.length ?? 0)
        )}`}
      >
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

      <div className="mt-6 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-slate-900">
          Fila de atendimento
        </h2>
        <p className="text-[11.5px] text-slate-500">
          Clique no status para alterar sem sair da lista
        </p>
      </div>

      <div className="mt-2.5">
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

      <div className="mt-3">
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

      <p className="mt-5 flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-500">
        <Lightbulb
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        A fila e ordenada pelo limite de envio: o mais urgente fica no topo.
        Prazo vencido aparece em vermelho, e envio postado depois do limite recebe
        a marca de fora do prazo.
      </p>

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
