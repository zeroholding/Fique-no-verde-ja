import { NextRequest, NextResponse } from "next/server";
import { authenticatePanelUser } from "@/lib/tracken/auth";
import { withClient } from "@/lib/tracken/db";
import { toErrorResponse } from "@/lib/tracken/errors";
import { buildTicketFilters, parsePanelFilters } from "@/lib/tracken/filters";

/**
 * GET /api/tracken/tickets
 * Listagem do painel. Autenticada pelo JWT do atendente, nunca por API key.
 */

export const dynamic = "force-dynamic";

const SORTABLE_COLUMNS: Record<string, string> = {
  deadline: "t.shipping_deadline",
  received: "t.received_at",
  sale: "t.sale_date",
  shipped: "t.shipped_at",
  carrier: "c.code",
  status: "sm.sort_order",
  seller: "t.seller_name",
  mode: "t.shipping_mode",
};

type TicketListRow = {
  id: string;
  shipment_id: string;
  order_id: string;
  carrier_code: string | null;
  carrier_name: string | null;
  carrier_color: string | null;
  buyer_nickname: string | null;
  buyer_name: string | null;
  seller_name: string;
  sale_date: string;
  shipping_deadline: string | null;
  shipped_at: string | null;
  shipping_mode: string | null;
  received_at: string;
  status: string;
  status_label: string | null;
  status_color: string | null;
  allowed_next: string[] | null;
  is_final: boolean | null;
  service_type: string;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  ml_claim_id: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const user = await authenticatePanelUser(request);

    const { searchParams } = new URL(request.url);
    const filters = parsePanelFilters(searchParams);
    const { clause, params } = buildTicketFilters(filters, user.id);

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(
      200,
      Math.max(5, Number(searchParams.get("pageSize")) || 25)
    );

    // Ordenacao padrao: limite de envio mais proximo primeiro. E o campo mais
    // critico da operacao, entao o mais urgente aparece no topo.
    const sortKey = searchParams.get("sortBy") ?? "deadline";
    const sortColumn = SORTABLE_COLUMNS[sortKey] ?? SORTABLE_COLUMNS.deadline;
    const sortDirection =
      searchParams.get("sortDir")?.toLowerCase() === "desc" ? "DESC" : "ASC";

    // As duas consultas rodam na MESMA conexao, em sequencia. O pool tem dez
    // slots no total e a tela dispara varias requisicoes ao carregar.
    const { total, rows } = await withClient(async (run) => {
      const totalResult = await run<{ total: string }>(
        `SELECT COUNT(*)::text AS total
           FROM tracken_tickets t
           LEFT JOIN tracken_carriers c ON c.id = t.carrier_id
           LEFT JOIN tracken_status_map sm ON sm.code = t.status
           ${clause}`,
        params
      );

      const listParams = [...params, pageSize, (page - 1) * pageSize];
      const listResult = await run<TicketListRow>(
        `SELECT t.id, t.shipment_id, t.order_id,
                c.code AS carrier_code, c.name AS carrier_name,
                c.color AS carrier_color,
                t.buyer_nickname, t.buyer_name, t.seller_name,
                t.sale_date, t.shipping_deadline, t.shipped_at,
                t.shipping_mode, t.received_at,
                t.status, sm.label AS status_label, sm.color AS status_color,
                sm.allowed_next, sm.is_final,
                t.service_type, t.assigned_user_id,
                NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '')
                  AS assigned_user_name,
                t.ml_claim_id
           FROM tracken_tickets t
           LEFT JOIN tracken_carriers c ON c.id = t.carrier_id
           LEFT JOIN tracken_status_map sm ON sm.code = t.status
           LEFT JOIN users u ON u.id = t.assigned_user_id
           ${clause}
           ORDER BY ${sortColumn} ${sortDirection} NULLS LAST,
                    t.received_at DESC, t.id
           LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      );

      return {
        total: Number(totalResult.rows[0]?.total ?? 0),
        rows: listResult.rows,
      };
    });

    return NextResponse.json({
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      tickets: rows,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
