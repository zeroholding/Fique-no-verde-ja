/**
 * Ganchos de inicialização do servidor: o Next chama `register` uma vez por
 * processo.
 *
 * Liga a agenda do e-mail diário com o saldo dos pacotes Flex (9h de Brasília),
 * em lib/saldo-pacotes/envio.ts. Só no runtime Node (o banco usa `pg`) e nunca
 * durante o `next build`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  try {
    const { iniciarAgendaSaldoPacotes } = await import("./lib/saldo-pacotes/envio");
    iniciarAgendaSaldoPacotes();
  } catch (erro) {
    // Uma falha aqui não pode derrubar o servidor: o resto do sistema segue no ar.
    console.error("[saldo-pacotes] Não foi possível ligar a agenda do e-mail diário:", erro);
  }
}
