"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, SearchX } from "lucide-react";
import { CarrierBadge } from "./Badges";
import CopyableId from "./CopyableId";
import DeadlineCell from "./DeadlineCell";
import MercadoLivreIcon from "./MercadoLivreIcon";
import RowStatusMenu from "./RowStatusMenu";
import ShippedCell from "./ShippedCell";
import ShippingModeBadge from "./ShippingModeBadge";
import type { PanelStatus, PanelTicket, SortState } from "./panel-types";
import {
  STATUS_REQUIRING_DENIAL_REASON,
  denialReasonLabel,
} from "@/lib/tracken/denial";
import { SERVICE_TYPE_LABELS } from "@/lib/tracken/format";

/**
 * Grade de atendimentos.
 *
 * Sao oito colunas, nao doze. Data da venda e data de recebimento sairam da
 * grade e vivem no detalhe: quem trabalha a fila decide pelo LIMITE de envio,
 * nao por quando a venda aconteceu. Os dois identificadores e as duas partes
 * (comprador e seller) foram empilhados em uma coluna cada, porque sao lidos
 * juntos.
 *
 * Sem regua vertical entre colunas: e a linha vertical que da aparencia de
 * planilha. A separacao e horizontal, o cabecalho fica fixo na rolagem e a
 * acao da linha aparece ao passar o mouse.
 */

const COLUMNS: Array<{
  key: string;
  label: string;
  sortKey?: string;
  align?: "right";
  width?: string;
  /** Marca as colunas que somem em tela media, por serem secundarias. */
  hideBelow?: "xl" | "lg";
}> = [
  { key: "carrier", label: "Transp.", sortKey: "carrier", width: "w-[104px]" },
  { key: "ids", label: "Envio · Venda", width: "w-[196px]" },
  { key: "parties", label: "Comprador · Seller", width: "w-[224px]" },
  { key: "mode", label: "Modalidade", sortKey: "mode", width: "w-[128px]" },
  { key: "deadline", label: "Limite de envio", sortKey: "deadline", width: "w-[168px]" },
  // Sem `hideBelow`: esta coluna passou a carregar o TAMANHO do atraso, que e
  // o dado pelo qual a fila e priorizada. Escondendo abaixo de 1280px, quem
  // trabalha em notebook menor ou tablet perdia justamente esse numero.
  {
    key: "shipped",
    label: "Envio realizado",
    sortKey: "shipped",
    width: "w-[156px]",
  },
  { key: "status", label: "Status", sortKey: "status", width: "w-[180px]" },
  { key: "actions", label: "", align: "right", width: "w-[84px]" },
];

const hideClass = (hideBelow?: "xl" | "lg") =>
  hideBelow === "xl" ? "hidden xl:table-cell" : hideBelow === "lg" ? "hidden lg:table-cell" : "";

type Props = {
  tickets: PanelTicket[];
  statuses: PanelStatus[];
  isLoading: boolean;
  sort: SortState;
  onSortChange: (sortKey: string) => void;
  onOpenTicket: (ticket: PanelTicket) => void;
  onChangeStatus: (
    ticketId: string,
    nextStatus: string,
    denialReason?: string | null
  ) => Promise<void>;
};

/** Esqueleto durante a primeira carga, para a tela nao piscar vazia. */
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 7 }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-[var(--tk-line)]">
          {COLUMNS.map((column) => (
            <td
              key={column.key}
              className={`px-3.5 py-3.5 ${hideClass(column.hideBelow)}`}
            >
              <span
                className="block h-3 animate-pulse rounded bg-slate-100"
                style={{
                  width: `${50 + ((rowIndex + column.key.length) % 5) * 9}%`,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Estado vazio, compartilhado pela grade e pelos cartoes. */
function NoResults() {
  return (
    <>
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
        Ajuste o período ou limpe os filtros. Novos envios da TRACKen aparecem
        aqui automaticamente.
      </p>
    </>
  );
}

/**
 * Um atendimento como cartao, para telas estreitas.
 *
 * Abaixo de 1024px a grade tinha `min-w-[1000px]`, entao no telefone ela virava
 * rolagem horizontal: para ler o status de uma linha era preciso arrastar a
 * tabela e perder de vista quem era o comprador. Aqui a mesma informacao e
 * empilhada, e o que a operacao decide primeiro -- limite e atraso -- fica lado
 * a lado, sem rolagem nenhuma.
 */
function TicketCard({
  ticket,
  statuses,
  onOpenTicket,
  onChangeStatus,
}: {
  ticket: PanelTicket;
  statuses: PanelStatus[];
  onOpenTicket: (ticket: PanelTicket) => void;
  onChangeStatus: Props["onChangeStatus"];
}) {
  return (
    <li className="tk-card tk-raised p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <CarrierBadge
            label={ticket.carrier_code ?? "—"}
            color={ticket.carrier_color}
            title={ticket.carrier_name ?? undefined}
          />
          <ShippingModeBadge mode={ticket.shipping_mode} />
          {ticket.service_type !== "atraso" && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {SERVICE_TYPE_LABELS[ticket.service_type] ?? ticket.service_type}
            </span>
          )}
        </span>

        <span className="shrink-0">
          <RowStatusMenu
            ticketId={ticket.id}
            statusLabel={ticket.status_label ?? ticket.status}
            statusColor={ticket.status_color}
            allowedNext={ticket.allowed_next ?? []}
            statuses={statuses}
            onApply={onChangeStatus}
          />
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <MercadoLivreIcon className="h-3.5 w-auto shrink-0 opacity-70" />
        <CopyableId value={ticket.shipment_id} label="ID de envio" />
        <CopyableId value={ticket.order_id} label="número da venda" muted />
      </div>

      <p className="mt-1.5 truncate text-[12.5px] font-medium text-slate-900">
        {ticket.buyer_nickname ?? "—"}
        {ticket.buyer_name && (
          <span className="font-normal text-slate-500">
            {" · "}
            {ticket.buyer_name}
          </span>
        )}
      </p>
      <p className="truncate text-[11.5px] text-slate-500" title={ticket.seller_name}>
        {ticket.seller_name}
      </p>

      {/* Limite e atraso lado a lado: e a comparacao que decide a prioridade. */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-[var(--tk-line)] pt-2.5">
        <div className="min-w-0">
          <span className="tk-eyebrow">Limite de envio</span>
          <div className="mt-0.5">
            <DeadlineCell deadline={ticket.shipping_deadline} />
          </div>
        </div>
        <div className="min-w-0">
          <span className="tk-eyebrow">Envio realizado</span>
          <div className="mt-0.5">
            <ShippedCell
              shippedAt={ticket.shipped_at}
              deadline={ticket.shipping_deadline}
            />
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-2 border-t border-[var(--tk-line)] pt-2.5">
        <span className="min-w-0">
          <span className="block truncate text-[11px] text-slate-500">
            {ticket.assigned_user_name ?? "Sem responsável"}
          </span>
          {ticket.status === STATUS_REQUIRING_DENIAL_REASON &&
            ticket.denial_reason && (
              <span className="mt-0.5 block text-[11px] font-medium leading-snug text-red-700">
                {denialReasonLabel(ticket.denial_reason)}
              </span>
            )}
        </span>

        <button
          type="button"
          onClick={() => onOpenTicket(ticket)}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-[var(--tk-line-strong)] bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-700 transition-colors hover:border-[var(--tk-brand)] hover:text-[var(--tk-brand-strong)]"
        >
          Abrir
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

/**
 * Ordenacao no mobile.
 *
 * Nos cartoes nao existe cabecalho de coluna para clicar, entao sem isto a
 * ordenacao simplesmente deixava de existir no telefone.
 */
function MobileSortBar({
  sort,
  onSortChange,
}: {
  sort: SortState;
  onSortChange: (sortKey: string) => void;
}) {
  const sortable = COLUMNS.filter((column) => column.sortKey);
  const current =
    sortable.find((column) => column.sortKey === sort.sortBy) ?? sortable[0];

  return (
    <div className="mb-2.5 flex items-center gap-2">
      <label
        htmlFor="tk-mobile-sort"
        className="tk-eyebrow shrink-0"
      >
        Ordenar
      </label>
      <select
        id="tk-mobile-sort"
        value={sort.sortBy}
        onChange={(event) => onSortChange(event.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-[var(--tk-line-strong)] bg-white px-2.5 py-1.5 text-[12.5px] text-slate-800"
      >
        {sortable.map((column) => (
          <option key={column.key} value={column.sortKey as string}>
            {column.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onSortChange(sort.sortBy)}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--tk-line-strong)] bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-slate-700"
        aria-label={`Inverter ordem (atual: ${
          sort.sortDir === "asc" ? "crescente" : "decrescente"
        })`}
      >
        {sort.sortDir === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {current?.label ? sort.sortDir === "asc" ? "Cresc." : "Decr." : ""}
      </button>
    </div>
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
    <>
      {/* ---------- Telas estreitas: cartoes ---------- */}
      <div className="lg:hidden">
        <MobileSortBar sort={sort} onSortChange={onSortChange} />

        {isLoading && tickets.length === 0 && (
          <ul className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, index) => (
              <li key={index} className="tk-card p-3">
                <span className="block h-3 w-1/3 animate-pulse rounded bg-slate-100" />
                <span className="mt-2.5 block h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                <span className="mt-2.5 block h-3 w-1/2 animate-pulse rounded bg-slate-100" />
              </li>
            ))}
          </ul>
        )}

        {!isLoading && tickets.length === 0 && (
          <div className="tk-card px-4 py-16 text-center">
            <NoResults />
          </div>
        )}

        <ul className="space-y-2.5">
          {tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              statuses={statuses}
              onOpenTicket={onOpenTicket}
              onChangeStatus={onChangeStatus}
            />
          ))}
        </ul>
      </div>

      {/* ---------- Telas largas: grade ---------- */}
      <div className="tk-card tk-raised hidden overflow-hidden lg:block">
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Grade de atendimentos"
      >
        <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-left">
          <caption className="sr-only">
            Atendimentos recebidos da TRACKen, ordenados pelo limite de envio
          </caption>

          <thead>
            <tr>
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
                    className={`sticky top-0 z-10 border-b border-[var(--tk-line)] bg-[var(--tk-surface-muted)] px-3.5 py-2.5 ${
                      column.width ?? ""
                    } ${column.align === "right" ? "text-right" : ""} ${hideClass(
                      column.hideBelow
                    )}`}
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
                  <NoResults />
                </td>
              </tr>
            )}

            {tickets.map((ticket) => (
              <tr key={ticket.id} className="tk-grid-row group">
                {/* Transportadora */}
                <td className="px-3.5 py-3">
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

                {/* Identificadores do Mercado Livre, empilhados */}
                <td className="px-3.5 py-3">
                  <span className="flex items-center gap-1.5">
                    <MercadoLivreIcon className="h-3.5 w-auto shrink-0 opacity-70" />
                    <CopyableId value={ticket.shipment_id} label="ID de envio" />
                  </span>
                  <span className="mt-0.5 block pl-[22px]">
                    <CopyableId
                      value={ticket.order_id}
                      label="número da venda"
                      muted
                    />
                  </span>
                </td>

                {/* Comprador e seller, lidos juntos */}
                <td className="px-3.5 py-3">
                  <span className="block truncate text-[13px] font-medium text-slate-900">
                    {ticket.buyer_nickname ?? "—"}
                    {ticket.buyer_name && (
                      <span className="font-normal text-slate-500">
                        {" · "}
                        {ticket.buyer_name}
                      </span>
                    )}
                  </span>
                  <span
                    className="mt-0.5 block truncate text-[11.5px] text-slate-500"
                    title={ticket.seller_name}
                  >
                    {ticket.seller_name}
                  </span>
                </td>

                <td className="px-3.5 py-3">
                  <ShippingModeBadge mode={ticket.shipping_mode} />
                </td>

                <td className="px-3.5 py-3">
                  <DeadlineCell deadline={ticket.shipping_deadline} />
                </td>

                <td className="px-3.5 py-3">
                  <ShippedCell
                    shippedAt={ticket.shipped_at}
                    deadline={ticket.shipping_deadline}
                  />
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
                  <span
                    className="mt-1 block max-w-[170px] truncate pl-[13px] text-[10.5px] text-slate-500"
                    title={ticket.assigned_user_name ?? undefined}
                  >
                    {ticket.assigned_user_name ?? "Sem responsável"}
                  </span>

                  {/* Negativa sem o motivo na linha obrigaria a abrir a ficha
                      para saber por que foi negada. */}
                  {ticket.status === STATUS_REQUIRING_DENIAL_REASON &&
                    ticket.denial_reason && (
                      <span
                        className="mt-0.5 block max-w-[170px] truncate pl-[13px] text-[10.5px] font-medium text-red-700"
                        title={
                          denialReasonLabel(ticket.denial_reason) ?? undefined
                        }
                      >
                        {denialReasonLabel(ticket.denial_reason)}
                      </span>
                    )}
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
    </>
  );
}
