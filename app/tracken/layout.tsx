import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { DM_Sans } from "next/font/google";
import TrackenLayoutClient from "./layout-client";

/**
 * Painel FNVJ x TRACKEN.
 *
 * Sessao compartilhada com o dashboard atual: mesmo cookie, mesmo JWT, mesma
 * tabela `users`. Quem esta logado em /dashboard ja esta logado aqui.
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

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const secret = new TextEncoder().encode(JWT_SECRET);

const validateSession = async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) {
    return false;
  }

  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
};

export default async function TrackenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authenticated = await validateSession();

  if (!authenticated) {
    // Pede login preservando o destino, em vez de mandar para /api/auth/logout.
    // O logout apaga o cookie, o que derrubava a sessao do dashboard tambem e
    // fazia o atendente perder o caminho de volta para o painel.
    redirect("/login?redirect=/tracken");
  }

  return (
    <div className={`${dmSans.variable} tracken-root`}>
      <TrackenLayoutClient>{children}</TrackenLayoutClient>
    </div>
  );
}
