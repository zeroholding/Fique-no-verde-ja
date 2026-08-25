"use client";

import { ArrowDown, ArrowUp, ChevronRight, Inbox } from "lucide-react";
import { CarrierBadge, StatusBadge } from "./Badges";
import CopyableId from "./CopyableId";
import DeadlineCell from "./DeadlineCell";
import type { PanelTicket, SortState } from "./panel-types";
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
  { key: "buyer", label: "Comprador", hint: "Apelido | Nome Completo" },
  { key: "seller", label: "Seller", hint: "Nome do Vendedor (ML)", sortKey: "seller" },
  { key: "sale", label: "Data da Venda", sortKey: "sale" },
  { key: "deadline", label: "Limite de Envio", sortKey: "deadline" },
  { key: "status", label: "Status Atendimento", sortKey: "status" },
  { key: "received", label: "Recebido em", sortKey: "received" },
  { key: "actions", label: "Acoes", align: "right" },
];

type Props = {
  tickets: PanelTicket[];
  isLoading: boolean;
  sort: SortState;
  onSortChange: (sortKey: string) => void;
  onOpenTicket: (ticket: PanelTicket) => void;
};

export default function TicketsTable({
  tickets,
  isLoading,
  sort,
  onSortChange,
  onOpenTicket,
}: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-left">
          <caption className="sr-only">
            Atendimentos recebidos da Tracken
          </caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {COLUMNS.map((column) => {
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
                    className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${
                      column.align === "right" ? "text-right" : ""
                    }`}
                  >
                    {column.sortKey ? (
                      <button
                        type="button"
                        onClick={() => onSortChange(column.sortKey as string)}
                        className={`inline-flex items-center gap-1 uppercase transition-colors hover:text-slate-800 ${
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
                      <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-slate-400">
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
                  <span className="text-sm text-slate-400">
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
                  <p className="mt-1 text-xs text-slate-400">
                    Ajuste os filtros ou aguarde novos envios da Tracken.
                  </p>
                </td>
              </tr>
            )}

            {tickets.map((ticket) => (
              <tr
                key={ticket.id}
                className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70"
              >
                <td className="px-4 py-3">
                  <CarrierBadge
                    label={ticket.carrier_code ?? "-"}
                    color={ticket.carrier_color}
                    title={ticket.carrier_name ?? undefined}
                  />
                  {ticket.service_type !== "atraso" && (
                    <span className="mt-1 block text-[10px] font-medium uppercase text-slate-400">
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
                  <span className="block text-xs text-slate-400">
                    {formatTime(ticket.sale_date)}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <DeadlineCell deadline={ticket.shipping_deadline} />
                </td>

                <td className="px-4 py-3">
                  <StatusBadge
                    label={ticket.status_label ?? ticket.status}
                    color={ticket.status_color}
                  />
                  {ticket.assigned_user_name && (
                    <span
                      className="mt-1 block max-w-[130px] truncate text-[10px] text-slate-400"
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
                  <span className="block text-xs text-slate-400">
                    {formatTime(ticket.received_at)}
                  </span>
                </td>

                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onOpenTicket(ticket)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700"
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
