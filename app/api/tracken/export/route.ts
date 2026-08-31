import { NextRequest, NextResponse } from "next/server";
import { authenticatePanelUser } from "@/lib/tracken/auth";
import { trackenQuery } from "@/lib/tracken/db";
import { toErrorResponse } from "@/lib/tracken/errors";
import { buildTicketFilters, parsePanelFilters } from "@/lib/tracken/filters";
import { denialReasonLabel } from "@/lib/tracken/denial";
import {
  formatDate,
  formatLateness,
  formatTime,
  toInputDate,
} from "@/lib/tracken/format";
import { describeShippingMode } from "@/lib/tracken/shipping";

/**
 * GET /api/tracken/export
 * Exporta os atendimentos do filtro corrente em CSV.
 *
 * Usa ponto e virgula como separador e BOM UTF-8 para o Excel em portugues
 * abrir o arquivo com os acentos e as colunas corretas.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Teto de linhas por exportacao, para nao estourar memoria. */
const EXPORT_ROW_LIMIT = 20_000;

const HEADERS = [
  "Transportadora",
  "ID de Envio",
  "Numero da Venda",
  "Apelido do Comprador",
  "Nome do Comprador",
  "Seller",
  "Servico",
  "Modalidade de Envio",
  "E FLEX",
  "Data da Venda",
  "Limite de Envio",
  "Envio Realizado em",
  // O atraso vai calculado, e nao deixado para quem abre a planilha subtrair
  // duas datas: a coluna existe justamente para poder ordenar e somar por ele.
  "Atraso do Envio",
  "Status",
  "Motivo da Negativa",
  "Recebido em",
  "Atendente",
  "Chamado ML",
  "Observacao",
];

/** Escapa um campo de CSV e neutraliza formulas do Excel. */
function toCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  let text = String(value);
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

type ExportRow = {
  carrier_code: string | null;
  shipment_id: string;
  order_id: string;
  buyer_nickname: string | null;
  buyer_name: string | null;
  seller_name: string;
  service_type: string;
  shipping_mode: string | null;
  sale_date: string;
  shipping_deadline: string | null;
  shipped_at: string | null;
  status_label: string | null;
  status: string;
  received_at: string;
  assigned_user_name: string | null;
  ml_claim_id: string | null;
  resolution_note: string | null;
  denial_reason: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const user = await authenticatePanelUser(request);

    const { searchParams } = new URL(request.url);
    const filters = parsePanelFilters(searchParams);
    const { clause, params } = buildTicketFilters(filters, user.id);

    const result = await trackenQuery<ExportRow>(
      `SELECT c.code AS carrier_code, t.shipment_id, t.order_id,
              t.buyer_nickname, t.buyer_name, t.seller_name, t.service_type,
              t.shipping_mode,
              t.sale_date, t.shipping_deadline, t.shipped_at,
              sm.label AS status_label, t.status, t.received_at,
              NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '')
                AS assigned_user_name,
              t.ml_claim_id, t.resolution_note, t.denial_reason
         FROM tracken_tickets t
         LEFT JOIN tracken_carriers c ON c.id = t.carrier_id
         LEFT JOIN tracken_status_map sm ON sm.code = t.status
         LEFT JOIN users u ON u.id = t.assigned_user_id
         ${clause}
         ORDER BY t.shipping_deadline ASC NULLS LAST, t.received_at DESC
         LIMIT ${EXPORT_ROW_LIMIT}`,
      params
    );

    const lines = [HEADERS.map(toCsvField).join(";")];

    result.rows.forEach((row) => {
      const saleDate = `${formatDate(row.sale_date)} ${formatTime(row.sale_date)}`;
      const deadline = row.shipping_deadline
        ? `${formatDate(row.shipping_deadline)} ${formatTime(row.shipping_deadline)}`
        : "";
      const receivedAt = `${formatDate(row.received_at)} ${formatTime(
        row.received_at
      )}`;
      const shippedAt = row.shipped_at
        ? `${formatDate(row.shipped_at)} ${formatTime(row.shipped_at)}`
        : "";

      const mode = describeShippingMode(row.shipping_mode);

      // Enviado depois do limite: quanto atrasou. Ainda nao enviado: o atraso
      // acumulado ate agora, para a planilha nao perder o caso em aberto, que
      // e justamente o que a operacao trabalha.
      const lateness =
        formatLateness(row.shipping_deadline, row.shipped_at ?? new Date()) ??
        "";

      lines.push(
        [
          row.carrier_code,
          row.shipment_id,
          row.order_id,
          row.buyer_nickname,
          row.buyer_name,
          row.seller_name,
          row.service_type,
          mode?.label ?? "",
          mode ? (mode.isFlex ? "Sim" : "Nao") : "",
          saleDate,
          deadline,
          shippedAt,
          lateness,
          row.status_label ?? row.status,
          denialReasonLabel(row.denial_reason) ?? "",
          receivedAt,
          row.assigned_user_name,
          row.ml_claim_id,
          row.resolution_note,
        ]
          .map(toCsvField)
          .join(";")
      );
    });

    const csv = `\uFEFF${lines.join("\r\n")}`;
    const fileName = `atendimentos-tracken-${toInputDate()}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
