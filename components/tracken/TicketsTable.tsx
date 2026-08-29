"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, SearchX } from "lucide-react";
import { CarrierBadge } from "./Badges";
import CopyableId from "./CopyableId";
import DeadlineCell from "./DeadlineCell";
import RowStatusMenu from "./RowStatusMenu";
import ShippingModeBadge from "./ShippingModeBadge";
import type { PanelStatus, PanelTicket, SortState } from "./panel-types";
import {
  SERVICE_TYPE_LABELS,
  formatDate,
  formatTime,
} from "@/lib/tracken/format";

/**
 * Grade de atendimentos.
 *
 * Sem regua vertical entre colunas: e a linha vertical que da aparencia de
 * planilha. A separacao e horizontal, o cabecalho e fixo na rolagem e a acao da
 * linha aparece ao passar o mouse, para a grade nao virar um mural de botoes.
 */

const COLUMNS: Array<{
  key: string;
  label: string;
  sortKey?: string;
  hint?: string;
  align?: "right";
  width?: string;
}> = [
  { key: "carrier", label: "Transp.", sortKey: "carrier", width: "w-[108px]" },
  { key: "shipment", label: "ID de envio", width: "w-[168px]" },
  { key: "order", label: "Nº da venda", width: "w-[184px]" },
  { key: "mode", label: "Modalidade", sortKey: "mode", width: "w-[132px]" },
  { key: "buyer", label: "Comprador", width: "w-[196px]" },
  { key: "seller", label: "Seller", sortKey: "seller", width: "w-[172px]" },
  { key: "sale", label: "Venda", sortKey: "sale", width: "w-[112px]" },
  { key: "deadline", label: "Limite de envio", sortKey: "deadline", width: "w-[168px]" },
  { key: "shipped", label: "Envio realizado", sortKey: "shipped", width: "w-[136px]" },
  { key: "status", label: "Status", sortKey: "status", width: "w-[176px]" },
  { key: "received", label: "Recebido", sortKey: "received", width: "w-[112px]" },
  { key: "actions", label: "", align: "right", width: "w-[92px]" },
];

type Props = {
  tickets: PanelTicket[];
  statuses: PanelStatus[];
  isLoading: boolean;
  sort: SortState;
  onSortChange: (sortKey: string) => void;
  onOpenTicket: (ticket: PanelTicket) => void;
  onChangeStatus: (ticketId: string, nextStatus: string) => Promise<void>;
};

/** Esqueleto durante a primeira carga, para a tela nao piscar vazia. */
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-[var(--tk-line)]">
          {COLUMNS.map((column) => (
            <td key={column.key} className="px-3.5 py-3">
              <span
                className="block h-3 animate-pulse rounded bg-slate-100"
                style={{ width: `${45 + ((rowIndex + column.key.length) % 5) * 10}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function TicketsTable({
  tickets,
  statuses,
  isLoading,
  sort,
  onSortChange,
  onOpenTicket,
  onChangeStatus,
}: Props) {
  return (
    <div className="tk-card tk-raised overflow-hidden">
      {/*
        tabIndex e role tornam a area rolavel alcancavel por teclado. Sem isso,
        quem navega sem mouse nao chega as colunas da direita.
      */}
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Grade de atendimentos, rolável horizontalmente"
      >
        <table className="w-full min-w-[1500px] border-separate border-spacing-0 text-left">
          <caption className="sr-only">
            Atendimentos recebidos da TRACKen
          </caption>

          <thead>
            <tr>
              {COLUMNS.map((column, index) => {
                const isSorted = column.sortKey === sort.sortBy;

                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      isSorted
                        ? sort.sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={`sticky top-0 z-10 border-b border-[var(--tk-line)] bg-[var(--tk-surface-muted)] px-3.5 py-2.5 ${
                      column.width ?? ""
                    } ${column.align === "right" ? "text-right" : ""} ${
                      // Primeira coluna fixa na rolagem lateral, para nao se
                      // perder de vista qual transportadora e a linha.
                      index === 0
                        ? "left-0 z-20 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-[var(--tk-line)]"
                        : ""
                    }`}
                  >
                    {column.sortKey ? (
                      <button
                        type="button"
                        onClick={() => onSortChange(column.sortKey as string)}
                        className={`group inline-flex items-center gap-1 rounded text-[11px] font-semibold uppercase tracking-[0.04em] transition-colors ${
                          isSorted
                            ? "text-[var(--tk-brand-strong)]"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {column.label}
                        {isSorted ? (
                          sort.sortDir === "asc" ? (
                            <ArrowUp className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="h-3 w-3" aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUpDown
                            className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-40"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500">
                        {column.label}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {isLoading && tickets.length === 0 && <SkeletonRows />}

            {!isLoading && tickets.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-20 text-center">
                  <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100">
                    <SearchX
                      className="h-5 w-5 text-slate-400"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </span>
                  <p className="text-[13.5px] font-semibold text-slate-800">
                    Nenhum atendimento encontrado
                  </p>
                  <p className="mx-auto mt-1 max-w-xs text-[12.5px] text-slate-500">
                    Ajuste o período ou limpe os filtros. Novos envios da TRACKen
                    aparecem aqui automaticamente.
                  </p>
                </td>
              </tr>
            )}

            {tickets.map((ticket) => (
              <tr key={ticket.id} className="tk-grid-row group">
                <td className="sticky left-0 z-10 bg-white px-3.5 py-3 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-[var(--tk-line)] group-hover:bg-[var(--tk-surface-muted)]">
                  <CarrierBadge
                    label={ticket.carrier_code ?? "—"}
                    color={ticket.carrier_color}
                    title={ticket.carrier_name ?? undefined}
                  />
                  {ticket.service_type !== "atraso" && (
                    <span className="mt-1 block pl-[11px] text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      {SERVICE_TYPE_LABELS[ticket.service_type] ??
                        ticket.service_type}
                    </span>
                  )}
                </td>

                <td className="px-3.5 py-3">
                  <CopyableId value={ticket.shipment_id} label="ID de envio" />
                </td>

                <td className="px-3.5 py-3">
                  <CopyableId value={ticket.order_id} label="número da venda" />
                </td>

                <td className="px-3.5 py-3">
                  <ShippingModeBadge mode={ticket.shipping_mode} />
                </td>

                <td className="px-3.5 py-3">
                  <span className="block truncate text-[13px] font-medium text-slate-900">
                    {ticket.buyer_nickname ?? "—"}
                  </span>
                  <span
                    className="block truncate text-[11.5px] text-slate-500"
                    title={ticket.buyer_name ?? undefined}
                  >
                    {ticket.buyer_name ?? "—"}
                  </span>
                </td>

                <td className="px-3.5 py-3">
                  <span
                    className="block truncate text-[13px] text-slate-700"
                    title={ticket.seller_name}
                  >
                    {ticket.seller_name}
                  </span>
                </td>

                <td className="px-3.5 py-3">
                  <span className="tk-num block text-[13px] text-slate-700">
                    {formatDate(ticket.sale_date)}
                  </span>
                  <span className="tk-num block text-[11.5px] text-slate-500">
                    {formatTime(ticket.sale_date)}
                  </span>
                </td>

                <td className="px-3.5 py-3">
                  <DeadlineCell deadline={ticket.shipping_deadline} />
                </td>

                <td className="px-3.5 py-3">
                  {ticket.shipped_at ? (
                    <>
                      <span className="tk-num block text-[13px] text-slate-700">
                        {formatDate(ticket.shipped_at)}
                      </span>
                      <span className="tk-num block text-[11.5px] text-slate-500">
                        {formatTime(ticket.shipped_at)}
                      </span>
                      {/* Postado depois do limite: o atraso ja se concretizou. */}
                      {ticket.shipping_deadline &&
                        new Date(ticket.shipped_at) >
                          new Date(ticket.shipping_deadline) && (
                          <span className="mt-1 inline-flex items-center rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                            Fora do prazo
                          </span>
                        )}
                    </>
                  ) : (
                    <span
                      className="text-[12.5px] text-slate-400"
                      title="Envio ainda não despachado ou data não informada"
                    >
                      Não enviado
                    </span>
                  )}
                </td>

                <td className="px-3.5 py-3">
                  <RowStatusMenu
                    ticketId={ticket.id}
                    statusLabel={ticket.status_label ?? ticket.status}
                    statusColor={ticket.status_color}
                    allowedNext={ticket.allowed_next ?? []}
                    statuses={statuses}
                    onApply={onChangeStatus}
                  />
                  {ticket.assigned_user_name && (
                    <span
                      className="mt-1 block max-w-[150px] truncate pl-[13px] text-[10.5px] text-slate-500"
                      title={ticket.assigned_user_name}
                    >
                      {ticket.assigned_user_name}
                    </span>
                  )}
                </td>

                <td className="px-3.5 py-3">
                  <span className="tk-num block text-[13px] text-slate-700">
                    {formatDate(ticket.received_at)}
                  </span>
                  <span className="tk-num block text-[11.5px] text-slate-500">
                    {formatTime(ticket.received_at)}
                  </span>
                </td>

                <td className="px-3.5 py-3 text-right">
                  <span className="tk-row-action">
                    <button
                      type="button"
                      onClick={() => onOpenTicket(ticket)}
                      className="inline-flex items-center gap-0.5 rounded-md border border-[var(--tk-line-strong)] bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-700 transition-colors hover:border-[var(--tk-brand)] hover:text-[var(--tk-brand-strong)]"
                    >
                      Abrir
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
