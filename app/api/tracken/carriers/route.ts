import { NextRequest, NextResponse } from "next/server";
import {
  authenticatePanelAdmin,
  authenticatePanelUser,
} from "@/lib/tracken/auth";
import { trackenQuery } from "@/lib/tracken/db";
import { badRequest, notFound, toErrorResponse } from "@/lib/tracken/errors";
import { getStatusMap } from "@/lib/tracken/tickets";

/**
 * GET   /api/tracken/carriers -> transportadoras + mapa de status (filtros)
 * PATCH /api/tracken/carriers -> ajusta nome, cor ou situacao (somente admin)
 */

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cores suportadas pelos badges do painel. */
const ALLOWED_COLORS = ["green", "blue", "amber", "red", "purple", "slate"];

type CarrierWithVolume = {
  id: string;
  code: string;
  name: string;
  color: string;
  is_active: boolean;
  total_tickets: string;
  open_tickets: string;
  overdue_tickets: string;
  last_received_at: string | null;
};

export async function GET(request: NextRequest) {
  try {
    await authenticatePanelUser(request);

    // A tela de Transportadoras precisa ver tambem as inativas.
    const includeInactive =
      new URL(request.url).searchParams.get("includeInactive") === "true";

    const carriers = await trackenQuery<CarrierWithVolume>(
      `SELECT c.id, c.code, c.name, c.color, c.is_active,
              COUNT(t.id)::text AS total_tickets,
              COUNT(t.id) FILTER (
                WHERE sm.is_final = false
              )::text AS open_tickets,
              COUNT(t.id) FILTER (
                WHERE sm.is_final = false
                  AND t.shipping_deadline < CURRENT_TIMESTAMP
              )::text AS overdue_tickets,
              MAX(t.received_at)::text AS last_received_at
         FROM tracken_carriers c
         LEFT JOIN tracken_tickets t ON t.carrier_id = c.id
         LEFT JOIN tracken_status_map sm ON sm.code = t.status
        ${includeInactive ? "" : "WHERE c.is_active = true"}
        GROUP BY c.id, c.code, c.name, c.color, c.is_active
        ORDER BY c.code`
    );

    const statuses = await getStatusMap();

    return NextResponse.json({
      carriers: carriers.rows.map((carrier) => ({
        ...carrier,
        total_tickets: Number(carrier.total_tickets),
        open_tickets: Number(carrier.open_tickets),
        overdue_tickets: Number(carrier.overdue_tickets),
      })),
      statuses,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await authenticatePanelAdmin(request);

    let body: {
      id?: string;
      name?: string;
      color?: string;
      isActive?: boolean;
    };

    try {
      body = await request.json();
    } catch {
      throw badRequest("INVALID_JSON", "Corpo da requisicao nao e um JSON valido");
    }

    if (!body.id || !UUID_REGEX.test(body.id)) {
      throw badRequest("INVALID_ID", "Identificador de transportadora invalido");
    }

    if (body.color !== undefined && !ALLOWED_COLORS.includes(body.color)) {
      throw badRequest(
        "INVALID_COLOR",
        `Cor deve ser uma de: ${ALLOWED_COLORS.join(", ")}`
      );
    }

    const name = body.name?.trim();
    if (body.name !== undefined && (!name || name.length > 200)) {
      throw badRequest("INVALID_NAME", "Nome deve ter entre 1 e 200 caracteres");
    }

    const result = await trackenQuery<{
      id: string;
      code: string;
      name: string;
      color: string;
      is_active: boolean;
    }>(
      `UPDATE tracken_carriers
          SET name = COALESCE($2, name),
              color = COALESCE($3, color),
              is_active = COALESCE($4, is_active)
        WHERE id = $1
        RETURNING id, code, name, color, is_active`,
      [body.id, name ?? null, body.color ?? null, body.isActive ?? null]
    );

    if (result.rowCount === 0) {
      throw notFound("Transportadora nao encontrada");
    }

    return NextResponse.json({ success: true, carrier: result.rows[0] });
  } catch (error) {
    return toErrorResponse(error);
  }
}
