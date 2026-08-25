"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import { CarrierBadge, StatusBadge } from "./Badges";
import CopyableId from "./CopyableId";
import DeadlineCell from "./DeadlineCell";
import type { PanelStatus, PanelTicket } from "./panel-types";
import {
  SERVICE_TYPE_LABELS,
  formatDate,
  formatTime,
} from "@/lib/tracken/format";

type TicketDetail = PanelTicket & {
  tracken_ref: string | null;
  seller_ml_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  resolution_note: string | null;
  tracking_number: string | null;
  pack_id: string | null;
  delay_reason: string | null;
  requested_by: string | null;
  allowed_next: string[] | null;
  is_final: boolean | null;
};

type TicketEvent = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  from_status_label: string | null;
  to_status_label: string | null;
  actor_type: string;
  actor_name: string | null;
  note: string | null;
  created_at: string;
};

const EVENT_LABELS: Record<string, string> = {
  received: "Recebido da Tracken",
  status_changed: "Status alterado",
  assigned: "Atribuido",
  unassigned: "Atribuicao removida",
  note: "Observacao",
  webhook_sent: "Tracken notificada",
  webhook_failed: "Falha ao notificar a Tracken",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

type Props = {
  ticketId: string;
  statuses: PanelStatus[];
  onClose: () => void;
  onUpdated: () => void;
};

export default function TicketDetailModal({
  ticketId,
  statuses,
  onClose,
  onUpdated,
}: Props) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [targetStatus, setTargetStatus] = useState("");
  const [note, setNote] = useState("");
  const [mlClaimId, setMlClaimId] = useState("");

  const loadTicket = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/tracken/tickets/${ticketId}`, {
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Falha ao carregar atendimento");
      }

      setTicket(data.ticket as TicketDetail);
      setEvents(data.events as TicketEvent[]);
      setMlClaimId((data.ticket as TicketDetail).ml_claim_id ?? "");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar atendimento"
      );
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleStatusChange = async () => {
    if (!targetStatus) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/tracken/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "status",
          status: targetStatus,
          note: note.trim() || null,
          mlClaimId: mlClaimId.trim() || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Falha ao alterar o status");
      }

      setTargetStatus("");
      setNote("");
      await loadTicket();
      onUpdated();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Falha ao alterar o status"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const allowedNext = (ticket?.allowed_next ?? []).map((code) => {
    const status = statuses.find((item) => item.code === code);
    return { code, label: status?.label ?? code };
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Detalhes do atendimento"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              Atendimento
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {ticket
                ? `Envio ${ticket.shipment_id} · Venda ${ticket.order_id}`
                : "Carregando..."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando atendimento...
          </div>
        )}

        {error && !isLoading && (
          <p
            role="alert"
            className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {ticket && !isLoading && (
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <CarrierBadge
                label={ticket.carrier_code ?? "-"}
                color={ticket.carrier_color}
                title={ticket.carrier_name ?? undefined}
              />
              <StatusBadge
                label={ticket.status_label ?? ticket.status}
                color={ticket.status_color}
              />
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                {SERVICE_TYPE_LABELS[ticket.service_type] ?? ticket.service_type}
              </span>
              <a
                href={`https://www.mercadolivre.com.br/vendas/${ticket.order_id}/detalhe`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Abrir venda no ML
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="ID de envio">
                <CopyableId value={ticket.shipment_id} label="ID de envio" />
              </Field>
              <Field label="N da venda">
                <CopyableId value={ticket.order_id} label="numero da venda" />
              </Field>
              <Field label="Limite de envio">
                <DeadlineCell deadline={ticket.shipping_deadline} />
              </Field>
              <Field label="Comprador">
                {ticket.buyer_nickname ?? "-"}
                <span className="block text-xs text-slate-500">
                  {ticket.buyer_name ?? "-"}
                </span>
              </Field>
              <Field label="Seller">
                {ticket.seller_name}
                {ticket.seller_ml_id && (
                  <span className="block text-xs text-slate-500">
                    ML ID {ticket.seller_ml_id}
                  </span>
                )}
              </Field>
              <Field label="Data da venda">
                {formatDate(ticket.sale_date)}
                <span className="block text-xs text-slate-500">
                  {formatTime(ticket.sale_date)}
                </span>
              </Field>
              <Field label="Recebido em">
                {formatDate(ticket.received_at)}
                <span className="block text-xs text-slate-500">
                  {formatTime(ticket.received_at)}
                </span>
              </Field>
              <Field label="Atendente">
                {ticket.assigned_user_name ?? "Nao atribuido"}
              </Field>
              <Field label="Chamado no ML">
                {ticket.ml_claim_id ?? "-"}
              </Field>
              {ticket.tracking_number && (
                <Field label="Rastreio">{ticket.tracking_number}</Field>
              )}
              {ticket.requested_by && (
                <Field label="Solicitado por">{ticket.requested_by}</Field>
              )}
              {ticket.delay_reason && (
                <Field label="Motivo do atraso">{ticket.delay_reason}</Field>
              )}
            </dl>

            {allowedNext.length > 0 && (
              <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-900">
                  Atualizar status
                </h3>

                <div className="mt-3 flex flex-wrap gap-2">
                  {allowedNext.map((option) => (
                    <button
                      key={option.code}
                      type="button"
                      onClick={() =>
                        setTargetStatus(
                          targetStatus === option.code ? "" : option.code
                        )
                      }
                      aria-pressed={targetStatus === option.code}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        targetStatus === option.code
                          ? "border-green-600 bg-green-600 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {targetStatus && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label
                        htmlFor="tracken-ml-claim"
                        className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                      >
                        Numero do chamado no ML (opcional)
                      </label>
                      <input
                        id="tracken-ml-claim"
                        type="text"
                        value={mlClaimId}
                        onChange={(event) => setMlClaimId(event.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="tracken-note"
                        className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                      >
                        Observacao (opcional)
                      </label>
                      <textarea
                        id="tracken-note"
                        rows={2}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleStatusChange}
                      disabled={isSaving}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving && (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      Confirmar alteracao
                    </button>
                  </div>
                )}
              </section>
            )}

            <section className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900">
                Historico de status
              </h3>

              <ol className="mt-3 space-y-3">
                {events.map((event) => (
                  <li key={event.id} className="flex gap-3">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1 border-b border-slate-100 pb-3">
                      <p className="text-sm font-medium text-slate-800">
                        {EVENT_LABELS[event.event_type] ?? event.event_type}
                        {event.to_status && (
                          <span className="font-normal text-slate-500">
                            {event.from_status_label
                              ? ` · ${event.from_status_label} para ${
                                  event.to_status_label ?? event.to_status
                                }`
                              : ` · ${event.to_status_label ?? event.to_status}`}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatDate(event.created_at)} {formatTime(event.created_at)}
                        {" · "}
                        {event.actor_name ?? event.actor_type}
                      </p>
                      {event.note && (
                        <p className="mt-1 text-xs text-slate-600">{event.note}</p>
                      )}
                    </div>
                  </li>
                ))}

                {events.length === 0 && (
                  <li className="text-xs text-slate-400">
                    Nenhum evento registrado.
                  </li>
                )}
              </ol>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
