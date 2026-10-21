import { NextRequest, NextResponse } from "next/server";

import { autorizarPainel } from "@/lib/live/acesso";
import { centralDoPainel } from "@/lib/live/central";
import type { EventoDoPainel } from "@/lib/live/tipos";

/**
 * GET /api/live/stream — fluxo em tempo real do painel ao vivo (Server-Sent
 * Events). Só administrador.
 *
 * Eventos:
 *  - painel  números de hoje (lib/live/tipos.ts). Chega na conexão e a cada mudança;
 *  - ping    { agora } a cada 15 s. Sinal de vida e acerto do relógio da tela;
 *  - estado  { banco: "ok" | "falhou" } quando o banco para ou volta a responder;
 *  - sessao  { motivo: "expirada" | "sem_permissao" } e o fluxo fecha.
 *
 * Recusa com 401/403/503 em JSON, sem abrir o fluxo; a tela consulta
 * /api/live para saber o motivo, porque o EventSource não expõe o status.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const acesso = await autorizarPainel(request);
  if (!acesso.ok) {
    return NextResponse.json(
      { error: acesso.mensagem, code: acesso.codigo },
      { status: acesso.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const codificador = new TextEncoder();
  let desligar: (() => void) | null = null;
  let fechado = false;

  const encerrar = () => {
    if (fechado) return;
    fechado = true;
    desligar?.();
    desligar = null;
  };

  const fluxo = new ReadableStream<Uint8Array>({
    start(controle) {
      const escrever = (texto: string) => {
        if (fechado) throw new Error("Fluxo já encerrado.");
        controle.enqueue(codificador.encode(texto));
      };

      // Se a conexão cair, o navegador tenta de novo em 3 s.
      escrever("retry: 3000\n\n");

      desligar = centralDoPainel().assinar({
        usuarioId: acesso.sessao.usuarioId,
        expiraEm: acesso.sessao.expiraEm,
        enviar: (evento: EventoDoPainel, dados: unknown) => {
          escrever(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
        },
        fechar: () => {
          encerrar();
          try {
            controle.close();
          } catch {
            // já fechado pelo navegador
          }
        },
      });

      request.signal.addEventListener("abort", encerrar, { once: true });
      if (request.signal.aborted) encerrar();
    },
    cancel() {
      encerrar();
    },
  });

  return new Response(fluxo, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform: nenhuma compressão no caminho pode segurar os eventos.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
