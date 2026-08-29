import { NextRequest, NextResponse } from "next/server";
import { authenticatePanelUser } from "@/lib/tracken/auth";
import { trackenQuery } from "@/lib/tracken/db";
import { toErrorResponse } from "@/lib/tracken/errors";

/**
 * GET /api/tracken/attendants
 * Alimenta o filtro de atendente do painel.
 *
 * Traz quem esta ativo hoje MAIS quem tem atendimento vinculado, mesmo que
 * inativo: sem isso, desativar um usuario esconderia os atendimentos dele do
 * filtro e eles ficariam invisiveis na operacao.
 */

export const dynamic = "force-dynamic";

type AttendantRow = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  total_tickets: string;
  open_tickets: string;
};

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticatePanelUser(request);

    const result = await trackenQuery<AttendantRow>(
      `SELECT u.id,
              COALESCE(
                NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''),
                u.email
              ) AS name,
              u.email,
              u.is_active,
              COUNT(t.id)::text AS total_tickets,
              COUNT(t.id) FILTER (
                WHERE COALESCE(sm.is_final, false) = false
              )::text AS open_tickets
         FROM users u
         LEFT JOIN tracken_tickets t ON t.assigned_user_id = u.id
         LEFT JOIN tracken_status_map sm ON sm.code = t.status
        WHERE u.is_active = true OR t.id IS NOT NULL
        GROUP BY u.id, u.first_name, u.last_name, u.email, u.is_active
        ORDER BY u.is_active DESC, name`
    );

    // Quantos atendimentos ainda nao tem responsavel.
    const unassigned = await trackenQuery<{ total: string }>(
      `SELECT COUNT(*)::text AS total
         FROM tracken_tickets t
         LEFT JOIN tracken_status_map sm ON sm.code = t.status
        WHERE t.assigned_user_id IS NULL
          AND COALESCE(sm.is_final, false) = false`
    );

    return NextResponse.json({
      currentUserId: currentUser.id,
      unassignedOpen: Number(unassigned.rows[0]?.total ?? 0),
      attendants: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        isActive: row.is_active,
        totalTickets: Number(row.total_tickets),
        openTickets: Number(row.open_tickets),
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
