import { NextRequest, NextResponse } from "next/server";

import { getMetaConfigStatus, syncMetaAds } from "@/lib/ads/meta-api";
import { authenticatePanelAdmin, authenticatePanelUser } from "@/lib/tracken/auth";
import { badRequest, toErrorResponse } from "@/lib/tracken/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/ads/sync
 *
 * GET  -> Retorna se a Meta Marketing API está configurada no ambiente.
 * POST -> Executa a sincronização com a Meta Marketing API (só admin).
 */

export async function GET(request: NextRequest) {
  try {
    await authenticatePanelUser(request);
    const status = getMetaConfigStatus();
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticatePanelAdmin(request);

    let body: { since?: string; until?: string } = {};
    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      // Ignora corpo inválido e usa períodos padrão
    }

    const status = getMetaConfigStatus();
    if (!status.isConfigured) {
      throw badRequest(
        "META_API_NOT_CONFIGURED",
        `A API da Meta não está configurada no servidor. Variáveis ausentes: ${status.missing.join(", ")}`
      );
    }

    const result = await syncMetaAds({
      since: body.since,
      until: body.until,
      userId: user.id,
    });

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
