import { NextRequest, NextResponse } from "next/server";

import { autorizarPainel } from "@/lib/live/acesso";
import { centralDoPainel } from "@/lib/live/central";

/**
 * GET /api/live — números de hoje do painel ao vivo, uma vez.
 *
 * A tela usa o fluxo /api/live/stream; esta rota é a reserva quando o fluxo
 * não passa (proxy que segura a resposta) e a forma de descobrir por que o
 * fluxo foi recusado (401, 403 ou 503). Só administrador.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SEM_CACHE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const acesso = await autorizarPainel(request);
  if (!acesso.ok) {
    return NextResponse.json(
      { error: acesso.mensagem, code: acesso.codigo },
      { status: acesso.status, headers: SEM_CACHE },
    );
  }

  try {
    const painel = await centralDoPainel().obter();
    return NextResponse.json({ painel }, { headers: SEM_CACHE });
  } catch {
    // O detalhe já foi para o log pela central.
    return NextResponse.json(
      { error: "O banco de dados não respondeu. Tentando de novo.", code: "banco_indisponivel" },
      { status: 503, headers: SEM_CACHE },
    );
  }
}
