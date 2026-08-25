import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest } from "@/lib/tracken/auth";
import { trackenQuery } from "@/lib/tracken/db";
import { notFound, toErrorResponse } from "@/lib/tracken/errors";

/**
 * GET /api/tracken/v1/tickets/{shipment_id}
 * Consulta de um atendimento pela chave natural do envio no Mercado Livre.
 */

export const dynamic = "force-dynamic";

type TicketDetail = {
  shipment_id: string;
  order_id: string;
  status: string;
  status_label: string | null;
  carrier_code: string | null;
  service_type: string;
  seller_name: string;
  buyer_nickname: string | null;
  buyer_name: string | null;
  assigned_to: string | null;
  sale_date: string;
  shipping_deadline: string | null;
  received_at: string;
  started_at: string | null;
  finished_at: string | null;
  ml_claim_id: string | null;
  resolution_note: string | null;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ shipmentId: string }> }
) {
  try {
    await authenticateMachineRequest(request, {
      rawBody: "",
      requiredScope: "tickets:read",
    });

    const { shipmentId } = await context.params;

    const result = await trackenQuery<TicketDetail & { id: string }>(
      `SELECT t.id, t.shipment_id, t.order_id, t.status,
              sm.label AS status_label, c.code AS carrier_code,
              t.service_type, t.seller_name, t.buyer_nickname, t.buyer_name,
              NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS assigned_to,
              t.sale_date, t.shipping_deadline, t.received_at,
              t.started_at, t.finished_at, t.ml_claim_id, t.resolution_note
         FROM tracken_tickets t
         LEFT JOIN tracken_carriers c ON c.id = t.carrier_id
         LEFT JOIN tracken_status_map sm ON sm.code = t.status
         LEFT JOIN users u ON u.id = t.assigned_user_id
        WHERE t.shipment_id = $1`,
      [shipmentId]
    );

    const ticket = result.rows[0];
    if (!ticket) {
      throw notFound();
    }

    // `from`, `to` e `at` sao palavras reservadas: os apelidos vao entre aspas.
    const history = await trackenQuery<{
      at: string;
      from: string | null;
      to: string | null;
      by: string | null;
      note: string | null;
    }>(
      `SELECT e.created_at AS "at",
              e.from_status AS "from",
              e.to_status AS "to",
              COALESCE(
                NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''),
                e.actor_type
              ) AS "by",
              e.note
         FROM tracken_ticket_events e
         LEFT JOIN users u ON u.id = e.actor_user_id
        WHERE e.ticket_id = $1
        ORDER BY e.created_at ASC`,
      [ticket.id]
    );

    // O id interno nao e exposto na API publica: a chave de fora e o shipment_id.
    const publicFields: Partial<TicketDetail & { id?: string }> = { ...ticket };
    delete publicFields.id;

    return NextResponse.json({
      ...publicFields,
      history: history.rows,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
