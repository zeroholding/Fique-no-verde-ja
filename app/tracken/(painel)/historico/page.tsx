"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, RefreshCw, Search } from "lucide-react";
import { CarrierBadge, StatusBadge } from "@/components/tracken/Badges";
import Pagination from "@/components/tracken/Pagination";
import {
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  PageShell,
} from "@/components/tracken/PageShell";
import { useTrackenCatalogs } from "@/components/tracken/useTrackenCatalogs";
import { formatDate, formatTime, toInputDate } from "@/lib/tracken/format";

/**
 * Tela "Historico de Status": trilha de auditoria.
 *
 * Le tracken_ticket_events, que e imutavel por trigger no banco: nenhuma linha
 * pode ser reescrita. Serve para responder "quem mudou o que, e quando".
 */

const EVENT_LABELS: Record<string, string> = {
  received: "Recebido da TRACKen",
  status_changed: "Status alterado",
  assigned: "Atribuido",
  unassigned: "Atribuicao removida",
  note: "Observacao",
  webhook_sent: "TRACKen notificada",
  webhook_failed: "Falha ao notificar",
};

const EVENT_TONE: Record<string, string> = {
  received: "bg-blue-50 text-blue-700",
  status_changed: "bg-slate-100 text-slate-700",
  assigned: "bg-purple-50 text-purple-700",
  unassigned: "bg-slate-100 text-slate-600",
  note: "bg-amber-50 text-amber-700",
  webhook_sent: "bg-green-50 text-green-700",
  webhook_failed: "bg-red-50 text-red-700",
};

const FIELD =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-green-500 focus:ring-2 focus:ring-green-100";
const LABEL =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500";

type EventRow = {
  id: string;
  ticket_id: string;
  shipment_id: string;
  order_id: string;
  carrier_code: string | null;
  carrier_color: string | null;
  event_type: string;
  from_status_label: string | null;
  to_status_label: string | null;
  to_status_color: string | null;
  actor_type: string;
  actor_name: string | null;
  note: string | null;
  created_at: string;
};

const hoje = new Date();
const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 3_600_000);

export default function HistoricoPage() {
  const { carriers, statuses } = useTrackenCatalogs();

  const [startDate, setStartDate] = useState(toInputDate(seteDiasAtras));
  const [endDate, setEndDate] = useState(toInputDate(hoje));
  const [eventType, setEventType] = useState("");
  const [status, setStatus] = useState("");
  const [carrier, setCarrier] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A busca espera o usuario parar de digitar.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchDraft);
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (eventType) params.set("eventType", eventType);
    if (status) params.set("status", status);
    if (carrier) params.set("carrier", carrier);
    if (search) params.set("search", search);
    return params.toString();
  }, [startDate, endDate, eventType, status, carrier, search]);

  const loadEvents = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      const params = new URLSearchParams(queryString);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      try {
        const response = await fetch(`/api/tracken/events?${params}`, {
          credentials: "include",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error?.message ?? "Falha ao carregar historico");
        }

        setEvents(data.events as EventRow[]);
        setTotal(data.total as number);
        setTotalPages(data.totalPages as number);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Falha ao carregar historico"
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [page, pageSize, queryString]
  );

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  return (
    <PageShell>
      <PageHeader
        title="Historico de Status"
        subtitle="Trilha de auditoria de todas as mudancas nos atendimentos: quem alterou o que, e quando"
        actions={
          <button
            type="button"
            onClick={() => loadEvents({ silent: true })}
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
        }
      />

      {error && <ErrorBanner message={error} />}

      <Card className="mt-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
          <div className="xl:col-span-3">
            <label className={LABEL} htmlFor="hist-inicio">Periodo</label>
            <div className="flex items-center gap-2">
              <input
                id="hist-inicio"
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                className={FIELD}
              />
              <span className="text-xs text-slate-400">ate</span>
              <input
                type="date"
                aria-label="Data final"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                className={FIELD}
              />
            </div>
          </div>

          <div className="xl:col-span-2">
            <label className={LABEL} htmlFor="hist-tipo">Tipo de evento</label>
            <select
              id="hist-tipo"
              value={eventType}
              onChange={(e) => { setEventType(e.target.value); setPage(1); }}
              className={FIELD}
            >
              <option value="">Todos</option>
              {Object.entries(EVENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="xl:col-span-2">
            <label className={LABEL} htmlFor="hist-status">Status destino</label>
            <select
              id="hist-status"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className={FIELD}
            >
              <option value="">Todos</option>
              {statuses.map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="xl:col-span-2">
            <label className={LABEL} htmlFor="hist-carrier">Transportadora</label>
            <select
              id="hist-carrier"
              value={carrier}
              onChange={(e) => { setCarrier(e.target.value); setPage(1); }}
              className={FIELD}
            >
              <option value="">Todas</option>
              {carriers.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
          </div>

          <div className="xl:col-span-3">
            <label className={LABEL} htmlFor="hist-busca">Buscar</label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="hist-busca"
                type="search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="ID de envio ou numero da venda"
                className={`${FIELD} pl-9`}
              />
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading && events.length === 0 ? (
          <LoadingState label="Carregando historico..." />
        ) : events.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nenhum evento no periodo"
            hint="Ajuste os filtros ou amplie o intervalo de datas."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <caption className="sr-only">Historico de mudancas</caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-3">Quando</th>
                  <th scope="col" className="px-4 py-3">Evento</th>
                  <th scope="col" className="px-4 py-3">Transportadora</th>
                  <th scope="col" className="px-4 py-3">ID de Envio</th>
                  <th scope="col" className="px-4 py-3">Transicao</th>
                  <th scope="col" className="px-4 py-3">Autor</th>
                  <th scope="col" className="px-4 py-3">Observacao</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    key={event.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="block text-sm text-slate-700">
                        {formatDate(event.created_at)}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {formatTime(event.created_at)}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ${
                          EVENT_TONE[event.event_type] ?? "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {EVENT_LABELS[event.event_type] ?? event.event_type}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <CarrierBadge
                        label={event.carrier_code ?? "-"}
                        color={event.carrier_color}
                      />
                    </td>

                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-slate-800">
                        {event.shipment_id}
                      </span>
                      <span className="block font-mono text-[11px] text-slate-400">
                        {event.order_id}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {event.to_status_label ? (
                        <span className="flex items-center gap-1.5 text-xs text-slate-500">
                          {event.from_status_label && (
                            <>
                              <span>{event.from_status_label}</span>
                              <span aria-hidden="true">-&gt;</span>
                            </>
                          )}
                          <StatusBadge
                            label={event.to_status_label}
                            color={event.to_status_color}
                          />
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-700">
                        {event.actor_name ??
                          (event.actor_type === "tracken"
                            ? "API TRACKen"
                            : event.actor_type === "system"
                              ? "Sistema"
                              : "-")}
                      </span>
                    </td>

                    <td className="max-w-[240px] px-4 py-3">
                      <span
                        className="block truncate text-xs text-slate-600"
                        title={event.note ?? undefined}
                      >
                        {event.note ?? "-"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={(next) => setPage(Math.min(Math.max(1, next), totalPages))}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      </div>

      <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-[11px] text-slate-500 shadow-sm">
        Este historico e imutavel: um trigger no banco impede que qualquer linha
        seja reescrita. Ele registra tanto o que a TRACKen envia quanto o que a
        equipe altera no painel.
      </p>
    </PageShell>
  );
}
