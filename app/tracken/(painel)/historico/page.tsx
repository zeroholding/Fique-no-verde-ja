"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  History,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  UserCheck,
  UserMinus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CarrierBadge, StatusBadge } from "@/components/tracken/Badges";
import MercadoLivreIcon from "@/components/tracken/MercadoLivreIcon";
import Pagination from "@/components/tracken/Pagination";
import {
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  PageShell,
  PrimaryButton,
} from "@/components/tracken/PageShell";
import { useTrackenCatalogs } from "@/components/tracken/useTrackenCatalogs";
import { formatDate, formatTime, toInputDate } from "@/lib/tracken/format";

/**
 * Tela "Historico de Status": trilha de auditoria.
 *
 * Le tracken_ticket_events, que e imutavel por trigger no banco: nenhuma linha
 * pode ser reescrita. Serve para responder "quem mudou o que, e quando".
 */

/**
 * Cada tipo de evento tem icone proprio. Numa trilha de auditoria longa, a
 * forma do icone e reconhecida antes do texto: da para varrer a coluna e achar
 * o que interessa sem ler linha por linha.
 */
const EVENT_META: Record<
  string,
  { label: string; icon: LucideIcon; tint: string }
> = {
  received: {
    label: "Recebido da TRACKen",
    icon: Inbox,
    tint: "bg-blue-50 text-blue-600",
  },
  status_changed: {
    label: "Status alterado",
    icon: ArrowRightLeft,
    tint: "bg-slate-100 text-slate-600",
  },
  assigned: {
    label: "Atribuído",
    icon: UserCheck,
    tint: "bg-purple-50 text-purple-600",
  },
  unassigned: {
    label: "Atribuição removida",
    icon: UserMinus,
    tint: "bg-slate-100 text-slate-500",
  },
  note: {
    label: "Observação",
    icon: MessageSquare,
    tint: "bg-amber-50 text-amber-600",
  },
  webhook_sent: {
    label: "TRACKen notificada",
    icon: Send,
    tint: "bg-green-50 text-green-600",
  },
  webhook_failed: {
    label: "Falha ao notificar",
    icon: AlertTriangle,
    tint: "bg-red-50 text-red-600",
  },
};

const EVENT_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(EVENT_META).map(([code, meta]) => [code, meta.label])
);

const FIELD =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] outline-none transition-colors focus:border-green-500 focus:ring-2 focus:ring-green-100";
const LABEL =
  "mb-1 block text-[12.5px] font-semibold uppercase tracking-wide text-slate-500";

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
          <PrimaryButton
            type="button"
            onClick={() => loadEvents({ silent: true })}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" strokeWidth={1.75} />
            ) : (
              <RefreshCw
                className="h-4 w-4"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            )}
            Atualizar
          </PrimaryButton>
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
              <span className="text-[13.5px] text-slate-400">ate</span>
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
                aria-hidden="true" strokeWidth={1.75} />
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
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Trilha de auditoria"
          >
            <table className="w-full min-w-[880px] border-separate border-spacing-0 text-left">
              <caption className="sr-only">
                Histórico de mudanças nos atendimentos
              </caption>
              <thead>
                <tr>
                  {[
                    "Quando",
                    "Evento",
                    "Atendimento",
                    "Transição",
                    "Autor",
                    "Observação",
                  ].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="sticky top-0 z-10 border-b border-[var(--tk-line)] bg-[var(--tk-surface-muted)] px-3.5 py-2.5 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-slate-500"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const meta = EVENT_META[event.event_type];
                  const Icon = meta?.icon ?? History;

                  return (
                    <tr key={event.id} className="tk-grid-row group">
                      <td className="whitespace-nowrap px-3.5 py-3">
                        <span className="tk-num block text-[14.5px] text-slate-700">
                          {formatDate(event.created_at)}
                        </span>
                        <span className="tk-num block text-[13px] text-slate-500">
                          {formatTime(event.created_at)}
                        </span>
                      </td>

                      <td className="px-3.5 py-3">
                        <span className="flex items-center gap-2">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                              meta?.tint ?? "bg-slate-100 text-slate-500"
                            }`}
                          >
                            <Icon
                              className="h-3.5 w-3.5"
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                          </span>
                          <span className="whitespace-nowrap text-[14px] font-medium text-slate-800">
                            {meta?.label ?? event.event_type}
                          </span>
                        </span>
                      </td>

                      {/* Transportadora e identificadores lidos juntos */}
                      <td className="px-3.5 py-3">
                        <span className="flex items-center gap-2">
                          <CarrierBadge
                            label={event.carrier_code ?? "—"}
                            color={event.carrier_color}
                          />
                          <MercadoLivreIcon className="h-3.5 w-auto shrink-0 opacity-60" />
                          <span className="tk-num font-mono text-[13.5px] text-slate-800">
                            {event.shipment_id}
                          </span>
                        </span>
                        <span className="tk-num mt-0.5 block pl-[13px] font-mono text-[12.5px] text-slate-500">
                          {event.order_id}
                        </span>
                      </td>

                      <td className="px-3.5 py-3">
                        {event.to_status_label ? (
                          <span className="flex items-center gap-1.5 text-[13px] text-slate-500">
                            {event.from_status_label && (
                              <>
                                <span>{event.from_status_label}</span>
                                <ArrowRightLeft
                                  className="h-3 w-3 shrink-0 text-slate-300"
                                  aria-hidden="true" strokeWidth={1.75} />
                              </>
                            )}
                            <StatusBadge
                              label={event.to_status_label}
                              color={event.to_status_color}
                            />
                          </span>
                        ) : (
                          <span className="text-[13.5px] text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-3.5 py-3">
                        <span className="text-[14px] text-slate-700">
                          {event.actor_name ??
                            (event.actor_type === "tracken"
                              ? "API TRACKen"
                              : event.actor_type === "system"
                                ? "Sistema"
                                : "—")}
                        </span>
                      </td>

                      <td className="max-w-[240px] px-3.5 py-3">
                        <span
                          className="block truncate text-[13.5px] text-slate-600"
                          title={event.note ?? undefined}
                        >
                          {event.note ?? "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
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

      <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-[12.5px] text-slate-500 shadow-sm">
        Este historico e imutavel: um trigger no banco impede que qualquer linha
        seja reescrita. Ele registra tanto o que a TRACKen envia quanto o que a
        equipe altera no painel.
      </p>
    </PageShell>
  );
}
