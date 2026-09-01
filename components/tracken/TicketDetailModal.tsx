"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  Barcode,
  CalendarClock,
  CalendarDays,
  Circle,
  ExternalLink,
  FileText,
  Headset,
  History,
  Inbox,
  Info,
  Loader2,
  Lock,
  MessageSquare,
  Package,
  PackageCheck,
  Receipt,
  RefreshCw,
  Send,
  Store,
  User,
  UserCheck,
  UserMinus,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import MercadoLivreIcon from "./MercadoLivreIcon";
import ShippingModeBadge from "./ShippingModeBadge";
import { CarrierBadge, StatusBadge } from "./Badges";
import CopyableId from "./CopyableId";
import DeadlineCell from "./DeadlineCell";
import ShippedCell from "./ShippedCell";
import type { PanelStatus, PanelTicket } from "./panel-types";
import {
  DENIAL_REASONS,
  STATUS_REQUIRING_DENIAL_REASON,
  denialReasonLabel,
} from "@/lib/tracken/denial";
import { statusIcon } from "./tokens";
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

/**
 * Cada tipo de evento com rotulo e icone.
 *
 * O historico era uma lista de bolinhas cinzas iguais: para saber se a linha
 * era troca de status, atribuicao ou falha de webhook era preciso ler o texto.
 * O icone responde isso antes da leitura, e a cor separa o que deu errado do
 * que e rotina.
 */
const EVENT_META: Record<
  string,
  { label: string; icon: LucideIcon; tone: string }
> = {
  received: {
    label: "Recebido da Tracken",
    icon: Inbox,
    tone: "bg-blue-50 text-blue-600",
  },
  status_changed: {
    label: "Status alterado",
    icon: ArrowRightLeft,
    tone: "bg-slate-100 text-slate-600",
  },
  assigned: {
    label: "Atribuido",
    icon: UserCheck,
    tone: "bg-green-50 text-green-600",
  },
  unassigned: {
    label: "Atribuicao removida",
    icon: UserMinus,
    tone: "bg-amber-50 text-amber-600",
  },
  note: {
    label: "Observacao",
    icon: MessageSquare,
    tone: "bg-slate-100 text-slate-600",
  },
  webhook_sent: {
    label: "Tracken notificada",
    icon: Send,
    tone: "bg-green-50 text-green-600",
  },
  webhook_failed: {
    label: "Falha ao notificar a Tracken",
    icon: AlertTriangle,
    tone: "bg-red-50 text-red-600",
  },
};

const EVENT_FALLBACK = {
  icon: Circle,
  tone: "bg-slate-100 text-slate-500",
};

/**
 * Ficha de um dado do atendimento.
 *
 * Cada uma tem icone: com quatorze fichas numa grade, rotulo em maiuscula
 * pequena e tudo igual, achar "Limite de envio" no meio exigia varrer a lista
 * palavra por palavra. O icone da ancora visual.
 */
function Field({
  label,
  icon: Icon,
  children,
  wide = false,
}: {
  label: string;
  icon: LucideIcon;
  children: React.ReactNode;
  /** Ocupa a linha inteira, para valor longo como motivo ou rastreio. */
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2 lg:col-span-3" : ""}>
      <dt className="tk-eyebrow flex items-center gap-1.5">
        <Icon
          className="h-[15px] w-[15px] shrink-0 text-slate-400"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        {label}
      </dt>
      <dd className="mt-1 text-[15.5px] leading-snug text-slate-800">
        {children}
      </dd>
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
  /** Motivo escolhido quando o status destino e "negado". */
  const [denialReason, setDenialReason] = useState("");
  const [mlClaimId, setMlClaimId] = useState("");

  /** Negar e a unica transicao com campo obrigatorio. */
  const isDenying = targetStatus === STATUS_REQUIRING_DENIAL_REASON;

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  /** Guarda onde o clique comecou, para nao fechar em selecao de texto. */
  const pressStartedOnBackdrop = useRef(false);

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

  // Leva o foco para dentro do dialogo e devolve ao fechar. Sem isso o foco
  // ficava no botao atras do overlay, e o teclado seguia percorrendo a pagina
  // que o aria-modal declara inexistente.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    // Travar a rolagem do fundo evita a pagina deslizar atras do dialogo.
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  const handleStatusChange = async () => {
    if (!targetStatus) return;

    // Barrado antes da requisicao para o atendente ver o que falta sem esperar
    // a ida ao servidor. A API valida de novo: esta checagem e conveniencia,
    // nao a regra.
    if (isDenying && !denialReason) {
      setError("Escolha o motivo da negativa");
      return;
    }

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
          denialReason: isDenying ? denialReason : null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Falha ao alterar o status");
      }

      setTargetStatus("");
      setNote("");
      setDenialReason("");
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
      onMouseDown={(event) => {
        pressStartedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // Fecha somente quando o clique COMECOU no fundo. Antes, arrastar para
        // selecionar um numero dentro do dialogo e soltar fora fechava a tela e
        // descartava a observacao ja digitada.
        if (event.target === event.currentTarget && pressStartedOnBackdrop.current) {
          onClose();
        }
        pressStartedOnBackdrop.current = false;
      }}
    >
      {/* max-w-5xl: com quatorze fichas e o historico, `3xl` obrigava a rolar
          o dialogo para ver o que cabia na largura disponivel. */}
      <div className="tk-overlay w-full max-w-5xl rounded-xl bg-white">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--tk-line)] px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--tk-brand-wash)]"
              aria-hidden="true"
            >
              <Package
                className="h-[19px] w-[19px] text-[var(--tk-brand-strong)]"
                strokeWidth={1.75}
              />
            </span>
            <div className="min-w-0">
              <h2 className="text-[18px] font-semibold text-slate-900">
                Detalhe do atendimento
              </h2>
              <p className="tk-num mt-0.5 font-mono text-[13.5px] text-slate-500">
                {ticket
                  ? `${ticket.shipment_id} · ${ticket.order_id}`
                  : "Carregando..."}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 px-5 py-16 text-[15px] text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando atendimento...
          </div>
        )}

        {error && !isLoading && (
          <p
            role="alert"
            className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[15px] text-red-700"
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
              <span className="rounded-md bg-slate-100 px-2 py-1 text-[13.5px] font-medium text-slate-700">
                {SERVICE_TYPE_LABELS[ticket.service_type] ?? ticket.service_type}
              </span>
              <ShippingModeBadge mode={ticket.shipping_mode} />
              <a
                href={`https://www.mercadolivre.com.br/vendas/${ticket.order_id}/detalhe`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[var(--tk-line-strong)] bg-white px-3 py-2 text-[14.5px] font-medium text-slate-700 transition-colors hover:border-[var(--tk-brand)] hover:bg-slate-50 hover:text-[var(--tk-brand-strong)]"
              >
                <MercadoLivreIcon className="h-[18px] w-auto" />
                Abrir venda
                <ExternalLink
                  className="h-4 w-4 text-slate-400"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </a>
            </div>

            {/* Tres colunas a partir de `lg`: com o modal mais largo, duas
                colunas deixavam metade da linha vazia em cada ficha curta. */}
            <dl className="mt-5 grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="ID de envio" icon={Package}>
                <CopyableId value={ticket.shipment_id} label="ID de envio" />
              </Field>
              <Field label="Nº da venda" icon={Receipt}>
                <CopyableId value={ticket.order_id} label="numero da venda" />
              </Field>
              <Field label="Limite de envio" icon={CalendarClock}>
                <DeadlineCell deadline={ticket.shipping_deadline} />
              </Field>
              <Field label="Comprador" icon={User}>
                {ticket.buyer_nickname ?? "-"}
                <span className="block text-[14px] text-slate-500">
                  {ticket.buyer_name ?? "-"}
                </span>
              </Field>
              <Field label="Seller" icon={Store}>
                {ticket.seller_name}
                {ticket.seller_ml_id && (
                  <span className="block text-[14px] text-slate-500">
                    ML ID {ticket.seller_ml_id}
                  </span>
                )}
              </Field>
              <Field label="Data da venda" icon={CalendarDays}>
                {formatDate(ticket.sale_date)}
                <span className="block text-[14px] text-slate-500">
                  {formatTime(ticket.sale_date)}
                </span>
              </Field>
              <Field label="Envio realizado em" icon={PackageCheck}>
                {/* Mesmo componente da grade: antes esta ficha repetia a
                    comparacao de datas e dizia apenas "Postado fora do prazo",
                    sem o tamanho do atraso. */}
                <ShippedCell
                  shippedAt={ticket.shipped_at}
                  deadline={ticket.shipping_deadline}
                />
              </Field>
              <Field label="Recebido em" icon={Inbox}>
                {formatDate(ticket.received_at)}
                <span className="block text-[14px] text-slate-500">
                  {formatTime(ticket.received_at)}
                </span>
              </Field>
              <Field label="Atendente" icon={Headset}>
                {ticket.assigned_user_name ?? (
                  <span className="text-slate-400">Não atribuído</span>
                )}
              </Field>
              <Field label="Chamado no ML" icon={FileText}>
                {ticket.ml_claim_id ?? <span className="text-slate-400">—</span>}
              </Field>
              {ticket.tracking_number && (
                <Field label="Rastreio" icon={Barcode}>
                  <span className="tk-num">{ticket.tracking_number}</span>
                </Field>
              )}
              {ticket.requested_by && (
                <Field label="Solicitado por" icon={UserCheck}>
                  {ticket.requested_by}
                </Field>
              )}
              {ticket.delay_reason && (
                <Field label="Motivo do atraso" icon={Info} wide>
                  {ticket.delay_reason}
                </Field>
              )}

              {/*
                Motivo da NEGATIVA (do atendente), diferente do "Motivo do
                atraso" acima, que vem da TRACKen e fala do envio.

                Aparece sempre que o atendimento esta negado, inclusive quando
                nao ha motivo: as 14 negativas anteriores a migracao 023 nao
                tem como ser preenchidas retroativamente, e dizer isso e melhor
                que omitir a ficha e deixar parecer que nunca se registra.
              */}
              {ticket.status === STATUS_REQUIRING_DENIAL_REASON && (
                <Field label="Motivo da negativa" icon={Ban} wide>
                  {ticket.denial_reason ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1 font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                      <Ban
                        className="h-4 w-4 shrink-0"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      {denialReasonLabel(ticket.denial_reason)}
                    </span>
                  ) : (
                    <span className="text-slate-400">
                      Não registrado
                      <span className="block text-[13px] leading-snug">
                        Negado antes de o motivo passar a ser obrigatório
                      </span>
                    </span>
                  )}
                </Field>
              )}
            </dl>

            {/* Sem transicao disponivel, explicar o motivo. Antes a secao
                simplesmente desaparecia e o atendente nao tinha como saber
                por que o atendimento estava sem botoes. */}
            {allowedNext.length === 0 && (
              <p className="mt-5 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-slate-700">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <span>
                  Nenhuma mudanca de status disponivel a partir de{" "}
                  <strong>{ticket.status_label ?? ticket.status}</strong>.
                  {ticket.is_final
                    ? " O atendimento esta finalizado; reabrir exige permissao administrativa."
                    : " Verifique as transicoes desse status em Configuracoes."}
                </span>
              </p>
            )}

            {allowedNext.length > 0 && (
              <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="flex items-center gap-2 text-[16px] font-semibold text-slate-900">
                  <RefreshCw
                    className="h-[17px] w-[17px] shrink-0 text-slate-400"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  Atualizar status
                </h3>

                <div className="mt-3 flex flex-wrap gap-2">
                  {allowedNext.map((option) => {
                    // O icone do destino torna a escolha reconhecivel sem ler:
                    // negar e remover sao acoes de peso muito diferente e
                    // ficavam como dois botoes de texto identicos.
                    const OptionIcon = statusIcon(option.code);
                    const isSelected = targetStatus === option.code;
                    const isDenyOption =
                      option.code === STATUS_REQUIRING_DENIAL_REASON;

                    return (
                    <button
                      key={option.code}
                      type="button"
                      onClick={() => {
                        setTargetStatus(isSelected ? "" : option.code);
                        // Trocar de destino descarta o motivo: motivo de
                        // negativa em transicao que nao e negativa e recusado
                        // pela API, e deixar selecionado engana o atendente.
                        setDenialReason("");
                        setError(null);
                      }}
                      aria-pressed={isSelected}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[14.5px] font-semibold transition-colors ${
                        isSelected
                          ? isDenyOption
                            ? "border-red-600 bg-red-600 text-white"
                            : "border-[var(--tk-brand-strong)] bg-[var(--tk-brand-strong)] text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <OptionIcon
                        className="h-4 w-4 shrink-0"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      {option.label}
                    </button>
                    );
                  })}
                </div>

                {targetStatus && (
                  <div className="mt-3 space-y-3">
                    {/* Negar exige motivo, e ele vem antes dos campos
                        opcionais: e o unico obrigatorio do formulario. */}
                    {isDenying && (
                      <fieldset>
                        <legend className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-red-700">
                          <Ban
                            className="h-4 w-4 shrink-0"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Motivo da negativa (obrigatório)
                        </legend>
                        <div className="space-y-2">
                          {DENIAL_REASONS.map((reason) => (
                            <label
                              key={reason.code}
                              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[15px] leading-snug transition-colors ${
                                denialReason === reason.code
                                  ? "border-red-400 bg-red-50 font-semibold text-red-800"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              <input
                                type="radio"
                                name="tracken-denial-reason"
                                value={reason.code}
                                checked={denialReason === reason.code}
                                onChange={() => setDenialReason(reason.code)}
                                className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
                              />
                              {reason.label}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}

                    <div>
                      <label
                        htmlFor="tracken-ml-claim"
                        className="mb-1 block text-[12.5px] font-semibold uppercase tracking-wide text-slate-500"
                      >
                        Numero do chamado no ML (opcional)
                      </label>
                      <input
                        id="tracken-ml-claim"
                        type="text"
                        value={mlClaimId}
                        onChange={(event) => setMlClaimId(event.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="tracken-note"
                        className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-slate-500"
                      >
                        <MessageSquare
                          className="h-4 w-4 shrink-0"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        Observação (opcional)
                      </label>
                      <textarea
                        id="tracken-note"
                        rows={2}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleStatusChange}
                      disabled={isSaving || (isDenying && !denialReason)}
                      title={
                        isDenying && !denialReason
                          ? "Escolha o motivo da negativa"
                          : undefined
                      }
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[15px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        isDenying
                          ? "bg-red-600 hover:bg-red-700"
                          : "bg-[var(--tk-brand-strong)] hover:bg-[#036c35]"
                      }`}
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

            <section className="mt-6">
              <h3 className="flex items-center gap-2 text-[16px] font-semibold text-slate-900">
                <History
                  className="h-[17px] w-[17px] shrink-0 text-slate-400"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                Histórico de status
              </h3>

              <ol className="mt-3 space-y-3">
                {events.map((event) => {
                  const meta = EVENT_META[event.event_type];
                  const EventIcon = meta?.icon ?? EVENT_FALLBACK.icon;
                  const tone = meta?.tone ?? EVENT_FALLBACK.tone;

                  return (
                  <li key={event.id} className="flex gap-2.5">
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone}`}
                      aria-hidden="true"
                    >
                      <EventIcon className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 flex-1 border-b border-slate-100 pb-3">
                      <p className="text-[15px] font-medium text-slate-800">
                        {meta?.label ?? event.event_type}
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
                      <p className="mt-0.5 text-[13.5px] text-slate-400">
                        {formatDate(event.created_at)} {formatTime(event.created_at)}
                        {" · "}
                        {event.actor_name ?? event.actor_type}
                      </p>
                      {event.note && (
                        <p className="mt-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[14px] leading-snug text-slate-600">
                          {event.note}
                        </p>
                      )}
                    </div>
                  </li>
                  );
                })}

                {events.length === 0 && (
                  <li className="flex items-center gap-2 text-[14px] text-slate-400">
                    <Circle
                      className="h-3.5 w-3.5 shrink-0"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
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
