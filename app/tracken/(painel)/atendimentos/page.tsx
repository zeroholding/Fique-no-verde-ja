"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import Pagination from "@/components/tracken/Pagination";
import TicketDetailModal from "@/components/tracken/TicketDetailModal";
import TicketsTable from "@/components/tracken/TicketsTable";
import TrackenFilters from "@/components/tracken/TrackenFilters";
import {
  ErrorBanner,
  PageHeader,
  PageShell,
} from "@/components/tracken/PageShell";
import { useTrackenCatalogs } from "@/components/tracken/useTrackenCatalogs";
import type {
  PanelFilterState,
  PanelTicket,
  SortState,
} from "@/components/tracken/panel-types";
import { toInputDate } from "@/lib/tracken/format";

/**
 * Tela "Atendimentos": a lista completa, sem graficos.
 *
 * Diferente do Painel de Atendimento, aqui o periodo comeca amplo (ultimos 30
 * dias) porque o uso e operacional: achar e trabalhar um atendimento
 * especifico, nao acompanhar o dia.
 */

const hoje = new Date();
const trintaDiasAtras = new Date(hoje.getTime() - 30 * 24 * 3_600_000);

const INITIAL_FILTERS: PanelFilterState = {
  startDate: toInputDate(trintaDiasAtras),
  endDate: toInputDate(hoje),
  carrier: "",
  status: "",
  deadline: "all",
  search: "",
  assignedToMe: false,
};

export default function AtendimentosPage() {
  const { carriers, statuses } = useTrackenCatalogs();

  const [filters, setFilters] = useState<PanelFilterState>(INITIAL_FILTERS);
  const [sort, setSort] = useState<SortState>({
    sortBy: "deadline",
    sortDir: "asc",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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
    if (filters.deadline !== "all") params.set("deadline", filters.deadline);
    if (filters.search) params.set("search", filters.search);
    if (filters.assignedToMe) params.set("assignedToMe", "true");
    return params.toString();
  }, [filters]);

  const loadTickets = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      const params = new URLSearchParams(queryString);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("sortBy", sort.sortBy);
      params.set("sortDir", sort.sortDir);

      try {
        const response = await fetch(`/api/tracken/tickets?${params}`, {
          credentials: "include",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error?.message ?? "Falha ao carregar atendimentos"
          );
        }

        setTickets(data.tickets as PanelTicket[]);
        setTotal(data.total as number);
        setTotalPages(data.totalPages as number);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Falha ao carregar atendimentos"
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [page, pageSize, queryString, sort.sortBy, sort.sortDir]
  );

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleFilterChange = (patch: Partial<PanelFilterState>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setPage(1);
  };

  return (
    <PageShell>
      <PageHeader
        title="Atendimentos"
        subtitle="Lista completa dos atendimentos recebidos da TRACKen, para trabalho do dia a dia"
        actions={
          <>
            <button
              type="button"
              onClick={() =>
                window.open(`/api/tracken/export?${queryString}`, "_blank")
              }
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Exportar
            </button>
            <button
              type="button"
              onClick={() => loadTickets({ silent: true })}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              Atualizar
            </button>
          </>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="mt-6">
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
          onSortChange={(sortKey) => {
            setSort((previous) =>
              previous.sortBy === sortKey
                ? {
                    sortBy: sortKey,
                    sortDir: previous.sortDir === "asc" ? "desc" : "asc",
                  }
                : { sortBy: sortKey, sortDir: "asc" }
            );
            setPage(1);
          }}
          onOpenTicket={(ticket) => setOpenTicketId(ticket.id)}
        />
      </div>

      <div className="mt-4">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={(next) => setPage(Math.min(Math.max(1, next), totalPages))}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      {openTicketId && (
        <TicketDetailModal
          ticketId={openTicketId}
          statuses={statuses}
          onClose={() => setOpenTicketId(null)}
          onUpdated={() => loadTickets({ silent: true })}
        />
      )}
    </PageShell>
  );
}
