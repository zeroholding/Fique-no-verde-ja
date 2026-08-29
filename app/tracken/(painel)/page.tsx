"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Inbox,
  Lightbulb,
  Loader2,
  RefreshCw,
  XCircle,
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
import type {
  PanelCarrier,
  PanelFilterState,
  PanelStats,
  PanelStatus,
  PanelTicket,
  SortState,
} from "@/components/tracken/panel-types";
import { formatPercent, toInputDate } from "@/lib/tracken/format";

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

  const [carriers, setCarriers] = useState<PanelCarrier[]>([]);
  const [statuses, setStatuses] = useState<PanelStatus[]>([]);
  const [stats, setStats] = useState<PanelStats | null>(null);
  const [tickets, setTickets] = useState<PanelTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    if (filters.carrier) params.set("carrier", filters.carrier);
    if (filters.status) params.set("status", filters.status);
    if (filters.deadline && filters.deadline !== "all") {
      params.set("deadline", filters.deadline);
    }
    if (filters.search) params.set("search", filters.search);
    if (filters.assignedToMe) params.set("assignedToMe", "true");
    return params.toString();
  }, [filters]);

  // Catalogos de filtro: carregados uma vez.
  useEffect(() => {
    const loadCatalogs = async () => {
      try {
        const response = await fetch("/api/tracken/carriers", {
          credentials: "include",
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            data?.error?.message ?? "Falha ao carregar transportadoras"
          );
        }
        setCarriers(data.carriers as PanelCarrier[]);
        setStatuses(data.statuses as PanelStatus[]);
      } catch (catalogError) {
        setError(
          catalogError instanceof Error
            ? catalogError.message
            : "Falha ao carregar dados de apoio"
        );
      }
    };

    loadCatalogs();
  }, []);

  const loadData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const listParams = new URLSearchParams(queryString);
      listParams.set("page", String(page));
      listParams.set("pageSize", String(pageSize));
      listParams.set("sortBy", sort.sortBy);
      listParams.set("sortDir", sort.sortDir);

      try {
        const [statsResponse, ticketsResponse] = await Promise.all([
          fetch(`/api/tracken/stats?${queryString}`, {
            credentials: "include",
          }),
          fetch(`/api/tracken/tickets?${listParams.toString()}`, {
            credentials: "include",
          }),
        ]);

        const statsData = await statsResponse.json();
        const ticketsData = await ticketsResponse.json();

        if (!statsResponse.ok) {
          throw new Error(
            statsData?.error?.message ?? "Falha ao carregar indicadores"
          );
        }
        if (!ticketsResponse.ok) {
          throw new Error(
            ticketsData?.error?.message ?? "Falha ao carregar atendimentos"
          );
        }

        setStats(statsData as PanelStats);
        setTickets(ticketsData.tickets as PanelTicket[]);
        setTotal(ticketsData.total as number);
        setTotalPages(ticketsData.totalPages as number);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Falha ao carregar o painel"
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [page, pageSize, queryString, sort.sortBy, sort.sortDir]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const handleExport = () => {
    window.open(`/api/tracken/export?${queryString}`, "_blank");
  };

  const kpiTotal = stats?.kpis.total ?? 0;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Painel de Atendimento Fique no Verde Ja x TRACKen
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestao central dos atendimentos de remocao de atraso recebidos via
            TRACKen
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden="true" />
            {filters.startDate.split("-").reverse().join("/")} ate{" "}
            {filters.endDate.split("-").reverse().join("/")}
          </span>

          <button
            type="button"
            onClick={() => loadData({ silent: true })}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
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

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
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

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-4">
        <CarrierDonut data={stats?.charts.byCarrier ?? []} total={kpiTotal} />
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
          isLoading={isLoading}
          sort={sort}
          onSortChange={handleSortChange}
          onOpenTicket={(ticket) => setOpenTicketId(ticket.id)}
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
        <p className="flex items-start gap-2 text-xs text-slate-500">
          <Lightbulb
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
            aria-hidden="true"
          />
          <span>
            <span className="font-semibold text-slate-700">Dica:</span> utilize os
            filtros acima para visualizar os atendimentos especificos. A
            ordenacao padrao coloca o limite de envio mais proximo no topo.
          </span>
        </p>

        <button
          type="button"
          onClick={handleExport}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
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
          onUpdated={() => loadData({ silent: true })}
        />
      )}
    </div>
  );
}
