import { NextRequest, NextResponse } from "next/server";
import { authenticatePanelUser } from "@/lib/tracken/auth";
import { trackenQuery } from "@/lib/tracken/db";
import { badRequest, notFound, toErrorResponse } from "@/lib/tracken/errors";
import { assignTicket, changeTicketStatus } from "@/lib/tracken/tickets";

/**
 * GET   /api/tracken/tickets/{id}  -> detalhe + historico
 * PATCH /api/tracken/tickets/{id}  -> muda status ou atribui atendente
 */

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await authenticatePanelUser(request);

    const { id } = await context.params;
    if (!UUID_REGEX.test(id)) {
      throw badRequest("INVALID_ID", "Identificador de atendimento invalido");
    }

    const result = await trackenQuery(
      `SELECT t.id, t.shipment_id, t.order_id, t.tracken_ref,
              c.code AS carrier_code, c.name AS carrier_name,
              c.color AS carrier_color,
              t.buyer_nickname, t.buyer_name,
              t.seller_name, t.seller_ml_id,
              t.sale_date, t.shipping_deadline, t.received_at,
              t.status, sm.label AS status_label, sm.color AS status_color,
              sm.allowed_next, sm.is_final,
              t.assigned_user_id,
              NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '')
                AS assigned_user_name,
              t.started_at, t.finished_at, t.resolution_note, t.ml_claim_id,
              t.service_type, t.tracking_number, t.pack_id,
              t.delay_reason, t.requested_by
         FROM tracken_tickets t
         LEFT JOIN tracken_carriers c ON c.id = t.carrier_id
         LEFT JOIN tracken_status_map sm ON sm.code = t.status
         LEFT JOIN users u ON u.id = t.assigned_user_id
        WHERE t.id = $1`,
      [id]
    );

    const ticket = result.rows[0];
    if (!ticket) {
      throw notFound();
    }

    const events = await trackenQuery(
      `SELECT e.id, e.event_type, e.from_status, e.to_status,
              e.actor_type, e.actor_user_id,
              NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '')
                AS actor_name,
              e.note, e.created_at,
              fs.label AS from_status_label, ts.label AS to_status_label
         FROM tracken_ticket_events e
         LEFT JOIN users u ON u.id = e.actor_user_id
         LEFT JOIN tracken_status_map fs ON fs.code = e.from_status
         LEFT JOIN tracken_status_map ts ON ts.code = e.to_status
        WHERE e.ticket_id = $1
        ORDER BY e.created_at DESC`,
      [id]
    );

    return NextResponse.json({ ticket, events: events.rows });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticatePanelUser(request);

    const { id } = await context.params;
    if (!UUID_REGEX.test(id)) {
      throw badRequest("INVALID_ID", "Identificador de atendimento invalido");
    }

    let body: {
      action?: string;
      status?: string;
      note?: string | null;
      mlClaimId?: string | null;
      assignedUserId?: string | null;
    };

    try {
      body = await request.json();
    } catch {
      throw badRequest("INVALID_JSON", "Corpo da requisicao nao e um JSON valido");
    }

    const action = body.action ?? "status";

    if (action === "assign") {
      const targetUserId =
        body.assignedUserId === undefined ? user.id : body.assignedUserId;

      if (targetUserId !== null && !UUID_REGEX.test(targetUserId)) {
        throw badRequest("INVALID_USER_ID", "assignedUserId invalido");
      }

      const updated = await assignTicket(id, user.id, targetUserId);
      return NextResponse.json({ success: true, ticket: updated });
    }

    if (action === "status") {
      const status = body.status?.trim();
      if (!status) {
        throw badRequest("MISSING_STATUS", "status e obrigatorio");
      }

      const updated = await changeTicketStatus({
        ticketId: id,
        toStatus: status,
        actorUserId: user.id,
        actorIsAdmin: user.is_admin,
        note: body.note?.trim() || null,
        mlClaimId: body.mlClaimId?.trim() || null,
      });

      return NextResponse.json({ success: true, ticket: updated });
    }

    throw badRequest("UNKNOWN_ACTION", `Acao "${action}" nao suportada`);
  } catch (error) {
    return toErrorResponse(error);
  }
}
