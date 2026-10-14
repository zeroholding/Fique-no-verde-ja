import { NextRequest, NextResponse } from "next/server";

import { ADS_MAX_RANGE_DAYS, daysBetween, isIsoDay, todayInSaoPaulo } from "@/lib/ads/dates";
import { withAdsClient } from "@/lib/ads/db";
import { loadDashboard } from "@/lib/ads/store";
import { authenticatePanelUser } from "@/lib/tracken/auth";
import { badRequest, toErrorResponse } from "@/lib/tracken/errors";

/**
 * GET /api/ads/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Números do painel para o período (qualquer usuário ativo). Sem período,
 * devolve os últimos 30 dias com dados.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await authenticatePanelUser(request);

    const params = request.nextUrl.searchParams;
    const from = params.get("from");
    const to = params.get("to");
    let period: { from: string | null; to: string | null } = { from: null, to: null };

    if (from || to) {
      if (!from || !to || !isIsoDay(from) || !isIsoDay(to)) {
        throw badRequest("PERIODO_INVALIDO", "Escolha datas válidas de início e fim.");
      }
      if (from > to) {
        throw badRequest("PERIODO_INVALIDO", "A data inicial precisa ser anterior à final.");
      }
      if (daysBetween(from, to) + 1 > ADS_MAX_RANGE_DAYS) {
        throw badRequest("PERIODO_INVALIDO", "Escolha um período de até 5 anos.");
      }
      period = { from, to };
    }

    const data = await withAdsClient((run) => loadDashboard(run, period, todayInSaoPaulo()));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
