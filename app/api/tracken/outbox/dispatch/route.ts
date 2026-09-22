import { NextRequest, NextResponse } from "next/server";
import { authenticatePanelAdmin } from "@/lib/tracken/auth";
import { timingSafeEqual } from "@/lib/tracken/crypto";
import { TrackenApiError, toErrorResponse } from "@/lib/tracken/errors";
import { dispatchOutbox } from "@/lib/tracken/webhook";

/**
 * POST /api/tracken/outbox/dispatch
 *
 * Entrega a fila de saida (`tracken_outbox`) no webhook da Tracken.
 *
 * Nao ha timer dentro do processo de proposito. `setInterval` em container que
 * reinicia no deploy, hiberna sem trafego ou escala para duas replicas resulta
 * em evento enviado duas vezes ou em nenhuma — e sem registro de qual dos casos
 * aconteceu. Um endpoint chamado de fora torna o agendamento visivel e o
 * disparo manual possivel.
 *
 * Duas formas de entrar:
 *   - agendador: header `X-Cron-Secret` (ou `Authorization: Bearer`) igual a
 *     CRON_SECRET;
 *   - admin do painel: sessao com `is_admin`, para o botao "enviar agora" e para
 *     conferir a configuracao sem esperar o proximo ciclo.
 *
 * Responde 200 mesmo quando entrega nenhuma. O corpo diz o que aconteceu. Erro
 * de entrega e estado da fila, nao falha desta requisicao: devolver 500 faria o
 * agendador tratar como indisponibilidade e mascararia a informacao util.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sem valor default, como todo segredo desta integracao.
 *
 * Um fallback aqui deixaria a rota aberta em qualquer ambiente onde a variavel
 * esquecesse de ser definida, e o efeito e disparar entregas para fora.
 */
function isCronCall(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get("x-cron-secret");
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.substring(7)
    : null;

  const presented = header ?? bearer;
  if (!presented) return false;

  return timingSafeEqual(expected, presented);
}

export async function POST(request: NextRequest) {
  try {
    if (!isCronCall(request)) {
      // Falha aqui se nao houver sessao administrativa. A ordem importa: tentar
      // o cron primeiro evita que o segredo enviado em `Authorization: Bearer`
      // seja interpretado como JWT de usuario e recuse por "sessao invalida",
      // mensagem que mandaria quem esta configurando o agendador para o lado
      // errado do problema.
      await authenticatePanelAdmin(request);
    }

    const url = new URL(request.url);
    const batchParam = Number(url.searchParams.get("batch"));
    const batchSize = Number.isFinite(batchParam) && batchParam > 0
      ? Math.trunc(batchParam)
      : undefined;

    const outcome = await dispatchOutbox({ batchSize });

    return NextResponse.json({
      ok: true,
      ...outcome,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * GET /api/tracken/outbox/dispatch
 *
 * Alguns agendadores so fazem GET. Recusar explicitamente e melhor que aceitar:
 * GET nao deve ter efeito colateral, e um crawler ou um preview de link
 * disparariam a fila inteira sem ninguem pedir.
 */
export async function GET() {
  return toErrorResponse(
    new TrackenApiError(
      405,
      "METHOD_NOT_ALLOWED",
      "Use POST com o header X-Cron-Secret para disparar a fila"
    )
  );
}
