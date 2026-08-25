import { NextRequest, NextResponse } from "next/server";
import { authenticatePanelUser } from "@/lib/tracken/auth";
import { trackenQuery } from "@/lib/tracken/db";
import { toErrorResponse } from "@/lib/tracken/errors";
import { PANEL_TIMEZONE } from "@/lib/tracken/filters";

/**
 * GET /api/tracken/events
 * Trilha de auditoria da tela "Historico de Status".
 * Le tracken_ticket_events, que e imutavel por trigger.
 */

export const dynamic = "force-dynamic";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const EVENT_TYPES = [
  "received",
  "status_changed",
  "assigned",
  "unassigned",
  "note",
  "webhook_sent",
  "webhook_failed",
];

type EventRow = {
  id: string;
  ticket_id: string;
  shipment_id: string;
  order_id: string;
  carrier_code: string | null;
  carrier_color: string | null;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  from_status_label: string | null;
  to_status_label: string | null;
  to_status_color: string | null;
  actor_type: string;
  actor_name: string | null;
  note: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    await authenticatePanelUser(request);

    const { searchParams } = new URL(request.url);
    const conditions: string[] = [];
    const params: unknown[] = [];

    const push = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    const startDate = searchParams.get("startDate");
    if (startDate && DATE_REGEX.test(startDate)) {
      conditions.push(
        `(e.created_at AT TIME ZONE '${PANEL_TIMEZONE}')::date >= ${push(
          startDate
        )}::date`
      );
    }

    const endDate = searchParams.get("endDate");
    if (endDate && DATE_REGEX.test(endDate)) {
      conditions.push(
        `(e.created_at AT TIME ZONE '${PANEL_TIMEZONE}')::date <= ${push(
          endDate
        )}::date`
      );
    }

    const eventType = searchParams.get("eventType");
    if (eventType && EVENT_TYPES.includes(eventType)) {
      conditions.push(`e.event_type = ${push(eventType)}`);
    }

    const toStatus = searchParams.get("status");
    if (toStatus) {
      conditions.push(`e.to_status = ${push(toStatus)}`);
    }

    const carrier = searchParams.get("carrier");
    if (carrier) {
      conditions.push(`c.code = ${push(carrier.toUpperCase())}`);
    }

    const actorUserId = searchParams.get("actorUserId");
    if (actorUserId) {
      conditions.push(`e.actor_user_id = ${push(actorUserId)}`);
    }

    const search = searchParams.get("search")?.trim();
    if (search) {
      const placeholder = push(`%${search.slice(0, 120)}%`);
      conditions.push(
        `(t.shipment_id ILIKE ${placeholder} OR t.order_id ILIKE ${placeholder})`
      );
    }

    const clause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(
      200,
      Math.max(10, Number(searchParams.get("pageSize")) || 50)
    );

    const from = `
      FROM tracken_ticket_events e
      JOIN tracken_tickets t ON t.id = e.ticket_id
      LEFT JOIN tracken_carriers c ON c.id = t.carrier_id
      LEFT JOIN users u ON u.id = e.actor_user_id
      LEFT JOIN tracken_status_map fs ON fs.code = e.from_status
      LEFT JOIN tracken_status_map ts ON ts.code = e.to_status
    `;

    const totalResult = await trackenQuery<{ total: string }>(
      `SELECT COUNT(*)::text AS total ${from} ${clause}`,
      params
    );

    const listParams = [...params, pageSize, (page - 1) * pageSize];
    const rows = await trackenQuery<EventRow>(
      `SELECT e.id, e.ticket_id, t.shipment_id, t.order_id,
              c.code AS carrier_code, c.color AS carrier_color,
              e.event_type, e.from_status, e.to_status,
              fs.label AS from_status_label,
              ts.label AS to_status_label,
              ts.color AS to_status_color,
              e.actor_type,
              NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '')
                AS actor_name,
              e.note, e.created_at
       ${from}
       ${clause}
       ORDER BY e.created_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    const total = Number(totalResult.rows[0]?.total ?? 0);

    return NextResponse.json({
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      events: rows.rows,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
