import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest } from "@/lib/tracken/auth";
import { toErrorResponse } from "@/lib/tracken/errors";
import { getStatusMap } from "@/lib/tracken/tickets";

/**
 * GET /api/tracken/v1/statuses
 * Catalogo de status do atendimento, para a Tracken nao precisar
 * manter a lista fixa no codigo dela.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await authenticateMachineRequest(request, {
      rawBody: "",
      requiredScope: "tickets:read",
    });

    const statuses = await getStatusMap();

    return NextResponse.json({
      statuses: statuses.map((status) => ({
        code: status.code,
        label: status.label,
        tracken_status: status.tracken_status,
        is_initial: status.is_initial,
        is_final: status.is_final,
        allowed_next: status.allowed_next,
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
