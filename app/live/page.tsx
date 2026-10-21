import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { conferirAdmin, lerSessao } from "@/lib/live/acesso";
import { centralDoPainel } from "@/lib/live/central";
import type { DadosDoPainel } from "@/lib/live/tipos";

import PainelAoVivo from "./painel-ao-vivo";

/**
 * Painel ao vivo de atendimentos realizados. Só administrador.
 *
 * Sem sessão válida: passa pelo logout (limpa cookie inválido) e volta ao
 * login com destino /live. Sem permissão: vai para o dashboard. Os números de
 * hoje já saem no HTML; depois a tela segue pelo fluxo em tempo real.
 */

export const dynamic = "force-dynamic";

export default async function PaginaAoVivo() {
  const sessao = await lerSessao((await cookies()).get("token")?.value);
  if (!sessao) {
    redirect(`/api/auth/logout?redirect=${encodeURIComponent("/live")}`);
  }

  const permissao = await conferirAdmin(sessao.usuarioId);
  // Com o banco fora do ar vale o que o token diz; as rotas de dados conferem
  // de novo quando o banco voltar.
  if (permissao === "negado" || (permissao === "indisponivel" && !sessao.adminNoToken)) {
    redirect("/dashboard");
  }

  let inicial: DadosDoPainel | null = null;
  if (permissao === "admin") {
    inicial = await centralDoPainel()
      .obter()
      .catch(() => null);
  }

  return <PainelAoVivo inicial={inicial} />;
}
