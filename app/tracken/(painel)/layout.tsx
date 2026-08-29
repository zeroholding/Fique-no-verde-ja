import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import TrackenLayoutClient from "./layout-client";

/**
 * Portao de sessao das telas autenticadas do painel.
 *
 * Sessao compartilhada com o dashboard atual: mesmo cookie, mesmo JWT, mesma
 * tabela `users`. Quem entra por /tracken/login tambem esta logado no
 * /dashboard, e vice-versa. O que muda e apenas por qual porta se entra.
 *
 * A tela de login fica FORA deste route group, senao ela cairia no proprio
 * redirecionamento.
 */

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

/**
 * Caminho pedido, para devolver o atendente ao destino depois do login.
 * O middleware injeta x-pathname; sem ele, cai no painel.
 */
const resolveRequestedPath = async () => {
  const headerList = await headers();
  const pathname = headerList.get("x-pathname");

  if (!pathname || !pathname.startsWith("/tracken")) {
    return "/tracken";
  }

  return pathname;
};

export default async function TrackenPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authenticated = await validateSession();

  if (!authenticated) {
    const requested = await resolveRequestedPath();
    redirect(`/tracken/login?redirect=${encodeURIComponent(requested)}`);
  }

  return <TrackenLayoutClient>{children}</TrackenLayoutClient>;
}
