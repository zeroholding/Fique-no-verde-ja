import type { Metadata } from "next";
import TrackenLoginForm from "@/components/tracken/TrackenLoginForm";

/**
 * Tela de login propria do painel FNVJ x TRACKEN.
 *
 * As credenciais sao as MESMAS do Fique no Verde: mesmo e-mail, mesma senha,
 * mesma tabela `users`, mesmo endpoint /api/auth/signin. O que muda e a porta
 * de entrada e a identidade visual, para o atendente que trabalha so com a
 * TRACKen nao precisar passar pelo sistema todo.
 */

export const metadata: Metadata = {
  title: "Entrar | Painel TRACKen",
  description: "Acesso ao painel de atendimento FNVJ x TRACKen",
  // Tela de autenticacao nao deve ser indexada.
  robots: { index: false, follow: false },
};

export default function TrackenLoginPage() {
  return <TrackenLoginForm />;
}
