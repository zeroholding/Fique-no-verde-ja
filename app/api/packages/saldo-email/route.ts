import { NextRequest, NextResponse } from "next/server";

import { ErroBrevo, configBrevo, motivoConfigBrevoAusente } from "@/lib/email/brevo";
import { enviarSaldoAgora, montarEmailDoMomento } from "@/lib/saldo-pacotes/envio";
import { getAuthErrorStatus, requireAdmin } from "@/lib/server-auth";
import { timingSafeEqual } from "@/lib/tracken/crypto";

/**
 * /api/packages/saldo-email
 *
 * O envio diário das 9h é feito pelo próprio servidor (ver
 * lib/saldo-pacotes/envio.ts). Esta rota serve para conferir e testar:
 *   GET  -> prévia do e-mail com o saldo de agora, em HTML. Não envia nada.
 *   POST -> envia agora, fora da agenda. Não conta como o envio do dia: o das
 *           9h sai normalmente.
 *
 * Acesso: admin do painel, ou o header `X-Cron-Secret` (ou `Authorization:
 * Bearer`) igual a CRON_SECRET, no mesmo padrão de /api/tracken/outbox/dispatch.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sem valor default: com a variável ausente, só admin entra. */
function chamadaComSegredo(request: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false;

  const header = request.headers.get("x-cron-secret");
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.substring(7) : null;
  const apresentado = header ?? bearer;
  if (!apresentado) return false;

  return timingSafeEqual(esperado, apresentado);
}

/** `null` quando pode seguir; senão, a resposta de recusa. */
async function autorizar(request: NextRequest): Promise<NextResponse | null> {
  // O segredo vem primeiro: assim ele nunca é lido como JWT de usuário.
  if (chamadaComSegredo(request)) return null;
  try {
    await requireAdmin(request);
    return null;
  } catch (erro) {
    const status = getAuthErrorStatus(erro);
    const mensagem = status === 500 ? "Erro ao validar o acesso" : erro instanceof Error ? erro.message : "Acesso negado";
    return NextResponse.json({ error: mensagem }, { status });
  }
}

export async function GET(request: NextRequest) {
  const recusa = await autorizar(request);
  if (recusa) return recusa;

  try {
    const { email } = await montarEmailDoMomento();
    return new NextResponse(email.html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (erro) {
    console.error("[saldo-pacotes] Falha ao montar a prévia:", erro);
    return NextResponse.json({ error: "Não foi possível montar a prévia do e-mail" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const recusa = await autorizar(request);
  if (recusa) return recusa;

  const config = configBrevo();
  if (!config) {
    return NextResponse.json({ error: `E-mail não configurado: ${motivoConfigBrevoAusente()}` }, { status: 503 });
  }

  try {
    const envio = await enviarSaldoAgora(config);
    return NextResponse.json({
      ok: true,
      messageId: envio.messageId,
      para: envio.para,
      assunto: envio.assunto,
      clientes: envio.resumo.clientes.length,
      saldoTotal: envio.resumo.totalQtde,
      saldoFinanceiro: envio.resumo.totalFinanceiro,
    });
  } catch (erro) {
    if (erro instanceof ErroBrevo) {
      return NextResponse.json({ error: erro.message, status: erro.status, codigo: erro.codigo }, { status: 502 });
    }
    console.error("[saldo-pacotes] Falha no envio manual:", erro);
    return NextResponse.json({ error: "Não foi possível enviar o e-mail" }, { status: 500 });
  }
}
