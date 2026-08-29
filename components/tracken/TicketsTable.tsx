"use client";

import { ArrowDown, ArrowUp, ChevronRight, Inbox } from "lucide-react";
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

const COLUMNS: Array<{
  key: string;
  label: string;
  sortKey?: string;
  hint?: string;
  align?: "right";
}> = [
  { key: "carrier", label: "Transportadora", sortKey: "carrier" },
  { key: "shipment", label: "ID de Envio" },
  { key: "order", label: "N da Venda" },
  { key: "mode", label: "Modalidade", hint: "Confirmar se e FLEX", sortKey: "mode" },
  { key: "buyer", label: "Comprador", hint: "Apelido | Nome Completo" },
  { key: "seller", label: "Seller", hint: "Nome do Vendedor (ML)", sortKey: "seller" },
  { key: "sale", label: "Data da Venda", sortKey: "sale" },
  { key: "deadline", label: "Limite de Envio", sortKey: "deadline" },
  { key: "shipped", label: "Envio Realizado", hint: "Data real da postagem", sortKey: "shipped" },
  { key: "status", label: "Status Atendimento", sortKey: "status" },
  { key: "received", label: "Recebido em", sortKey: "received" },
  { key: "actions", label: "Acoes", align: "right" },
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
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/*
        tabIndex e role tornam a area rolavel alcancavel por teclado. Sem isso,
        quem navega sem mouse nao consegue chegar as colunas da direita.
      */}
      <div
        className="overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-500"
        tabIndex={0}
        role="region"
        aria-label="Tabela de atendimentos, rolável horizontalmente"
      >
        <table className="w-full min-w-[1320px] border-collapse text-left">
          <caption className="sr-only">
            Atendimentos recebidos da Tracken
          </caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
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
                    className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600 ${
                      column.align === "right" ? "text-right" : ""
                    } ${
                      // A primeira coluna fica fixa para nao se perder de vista
                      // durante a rolagem lateral.
                      index === 0
                        ? "sticky left-0 z-10 bg-slate-50 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-slate-200"
                        : ""
                    }`}
                  >
                    {column.sortKey ? (
                      <button
                        type="button"
                        onClick={() => onSortChange(column.sortKey as string)}
                        className={`inline-flex items-center gap-1 uppercase transition-colors hover:text-slate-900 ${
                          isSorted ? "text-green-700" : ""
                        }`}
                      >
                        {column.label}
                        {isSorted &&
                          (sort.sortDir === "asc" ? (
                            <ArrowUp className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="h-3 w-3" aria-hidden="true" />
                          ))}
                      </button>
                    ) : (
                      column.label
                    )}
                    {column.hint && (
                      <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-slate-500">
                        {column.hint}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {isLoading && tickets.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-16 text-center">
                  <span className="text-sm text-slate-500">
                    Carregando atendimentos...
                  </span>
                </td>
              </tr>
            )}

            {!isLoading && tickets.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-16 text-center">
                  <Inbox
                    className="mx-auto mb-3 h-8 w-8 text-slate-300"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium text-slate-600">
                    Nenhum atendimento encontrado
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Ajuste os filtros ou aguarde novos envios da Tracken.
                  </p>
                </td>
              </tr>
            )}

            {tickets.map((ticket) => (
              <tr
                key={ticket.id}
                className="group border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70"
              >
                <td className="sticky left-0 z-10 bg-white px-4 py-3 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-slate-100 group-hover:bg-slate-50">
                  <CarrierBadge
                    label={ticket.carrier_code ?? "-"}
                    color={ticket.carrier_color}
                    title={ticket.carrier_name ?? undefined}
                  />
                  {ticket.service_type !== "atraso" && (
                    <span className="mt-1 block text-[10px] font-medium uppercase text-slate-500">
                      {SERVICE_TYPE_LABELS[ticket.service_type] ??
                        ticket.service_type}
                    </span>
                  )}
                </td>

                <td className="px-4 py-3">
                  <CopyableId value={ticket.shipment_id} label="ID de envio" />
                </td>

                <td className="px-4 py-3">
                  <CopyableId value={ticket.order_id} label="numero da venda" />
                </td>

                <td className="px-4 py-3">
                  <ShippingModeBadge mode={ticket.shipping_mode} />
                </td>

                <td className="max-w-[190px] px-4 py-3">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {ticket.buyer_nickname ?? "-"}
                  </span>
                  <span
                    className="block truncate text-xs text-slate-500"
                    title={ticket.buyer_name ?? undefined}
                  >
                    {ticket.buyer_name ?? "-"}
                  </span>
                </td>

                <td className="max-w-[170px] px-4 py-3">
                  <span
                    className="block truncate text-sm text-slate-700"
                    title={ticket.seller_name}
                  >
                    {ticket.seller_name}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <span className="block text-sm text-slate-700">
                    {formatDate(ticket.sale_date)}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {formatTime(ticket.sale_date)}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <DeadlineCell deadline={ticket.shipping_deadline} />
                </td>

                <td className="px-4 py-3">
                  {ticket.shipped_at ? (
                    <>
                      <span className="block text-sm text-slate-700">
                        {formatDate(ticket.shipped_at)}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {formatTime(ticket.shipped_at)}
                      </span>
                      {/* Postado depois do limite: o atraso ja se concretizou. */}
                      {ticket.shipping_deadline &&
                        new Date(ticket.shipped_at) >
                          new Date(ticket.shipping_deadline) && (
                          <span className="mt-0.5 block text-[10px] font-semibold text-red-600">
                            Fora do prazo
                          </span>
                        )}
                    </>
                  ) : (
                    <span
                      className="text-sm text-slate-400"
                      title="Envio ainda não despachado ou data não informada"
                    >
                      Não enviado
                    </span>
                  )}
                </td>

                <td className="px-4 py-3">
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
                      className="mt-1 block max-w-[130px] truncate text-[10px] text-slate-500"
                      title={ticket.assigned_user_name}
                    >
                      {ticket.assigned_user_name}
                    </span>
                  )}
                </td>

                <td className="px-4 py-3">
                  <span className="block text-sm text-slate-700">
                    {formatDate(ticket.received_at)}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {formatTime(ticket.received_at)}
                  </span>
                </td>

                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onOpenTicket(ticket)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  >
                    Detalhes
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
