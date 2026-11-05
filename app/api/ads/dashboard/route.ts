import { NextRequest, NextResponse } from "next/server";

import { ADS_MAX_RANGE_DAYS, daysBetween, isIsoDay, todayInSaoPaulo } from "@/lib/ads/dates";
import { withAdsClient } from "@/lib/ads/db";
import { ADS_STATUS_GROUPS, loadDashboard } from "@/lib/ads/store";
import { authenticatePanelUser } from "@/lib/tracken/auth";
import { badRequest, toErrorResponse } from "@/lib/tracken/errors";

/**
 * GET /api/ads/dashboard
 *
 *   from, to     período (YYYY-MM-DD)
 *   today=1      recorta só o dia de hoje dentro do período
 *   status       active | paused | archived
 *   campaign     id da campanha
 *   q            busca por nome de anúncio, campanha ou conjunto
 *
 * Números do painel para o recorte. A conta é única: não há filtro por conta.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_VALUES = new Set(ADS_STATUS_GROUPS.map((group) => group.value as string));

export async function GET(request: NextRequest) {
  try {
    await authenticatePanelUser(request);

    const params = request.nextUrl.searchParams;
    const from = params.get("from");
    const to = params.get("to");
    const today = todayInSaoPaulo();

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

    const status = params.get("status");
    if (status && !STATUS_VALUES.has(status)) {
      throw badRequest("FILTRO_INVALIDO", "Situação do anúncio desconhecida.");
    }

    const search = (params.get("q") ?? "").trim().slice(0, 120);
    const campaign = (params.get("campaign") ?? "").trim().slice(0, 120);
    const onlyToday = params.get("today") === "1";

    const data = await withAdsClient((run) =>
      loadDashboard(
        run,
        {
          ...period,
          day: onlyToday ? today : null,
          status: status || null,
          campaignId: campaign || null,
          search: search || null,
        },
        today
      )
    );

    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
