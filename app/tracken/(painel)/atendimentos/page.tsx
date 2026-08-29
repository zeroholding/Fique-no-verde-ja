"use client";

import { useCallback, useState } from "react";
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
import { usePanelTickets } from "@/components/tracken/usePanelTickets";
import type {
  PanelFilterState,
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
  shippingMode: "",
  attendant: "",
  search: "",
  assignedToMe: false,
};

export default function AtendimentosPage() {
  const { carriers, statuses, attendants, unassignedOpen, error: catalogError } =
    useTrackenCatalogs();

  const [filters, setFilters] = useState<PanelFilterState>(INITIAL_FILTERS);
  const [sort, setSort] = useState<SortState>({
    sortBy: "deadline",
    sortDir: "asc",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  const {
    tickets,
    total,
    totalPages,
    isLoading,
    isRefreshing,
    error,
    queryString,
    reload,
  } = usePanelTickets({ filters, sort, page, pageSize });

  const handleFilterChange = (patch: Partial<PanelFilterState>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setPage(1);
  };

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
        throw new Error(data?.error?.message ?? "Falha ao alterar o status");
      }

      await reload({ silent: true });
    },
    [reload]
  );

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
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Exportar
            </button>
            <button
              type="button"
              onClick={() => reload({ silent: true })}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 disabled:opacity-60"
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

      {(error || catalogError) && (
        <ErrorBanner message={error ?? catalogError ?? ""} />
      )}

      <div className="mt-6">
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
          onChangeStatus={handleChangeStatus}
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
          onUpdated={() => reload({ silent: true })}
        />
      )}
    </PageShell>
  );
}
