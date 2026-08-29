import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";

/**
 * Camada visual do painel FNVJ x TRACKEN.
 *
 * Aqui NAO ha checagem de sessao: este layout envolve tanto a tela de login
 * (/tracken/login) quanto as telas autenticadas. O portao de sessao fica em
 * app/tracken/(painel)/layout.tsx, para a pagina de login nao se redirecionar
 * para si mesma em loop.
 *
 * O tema e claro, diferente do dashboard atual (escuro). A escolha e
 * intencional e segue o mockup aprovado.
 */

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-tracken-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Painel de Atendimento | FNVJ x TRACKen",
  description:
    "Gestao central dos atendimentos de remocao de atraso recebidos via TRACKen",
};

export default function TrackenRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`${dmSans.variable} tracken-root`}>{children}</div>;
}
