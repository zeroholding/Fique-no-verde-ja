import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";

import { trackenQuery } from "@/lib/tracken/db";

import AdsShell from "./ads-shell";
import type { AdsViewer } from "./_components/viewer-context";

/**
 * O Ads usa exatamente a mesma sessão do FNVJ e do Tracken: mesmo cookie,
 * mesmo JWT, mesma tabela `users`. O middleware só confere se o cookie existe;
 * aqui a assinatura é validada e o usuário é lido do banco antes de qualquer
 * tela do módulo.
 */
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const secret = new TextEncoder().encode(JWT_SECRET);

export const metadata: Metadata = {
  title: { default: "Tráfego pago | Fique no Verde Já", template: "%s | Tráfego pago" },
  description: "Resultados das campanhas do Meta Ads da Fique no Verde Já",
};

type Session = { userId: string; isAdmin: boolean };

async function readSession(): Promise<Session | null> {
  const token = (await cookies()).get("token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.userId !== "string" || payload.userId === "") return null;
    return { userId: payload.userId, isAdmin: payload.isAdmin === true };
  } catch {
    return null;
  }
}

/** Destino original, para voltar a ele depois do login (o middleware injeta x-pathname). */
async function requestedAdsPath(): Promise<string> {
  const pathname = (await headers()).get("x-pathname");
  return pathname && (pathname === "/ads" || pathname.startsWith("/ads/")) ? pathname : "/ads";
}

type ViewerLookup = { allowed: true; viewer: AdsViewer } | { allowed: false };

async function loadViewer(session: Session): Promise<ViewerLookup> {
  try {
    const result = await trackenQuery<{
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      is_admin: boolean;
      is_active: boolean;
    }>(
      `SELECT first_name, last_name, email, is_admin, is_active
         FROM users
        WHERE id = $1`,
      [session.userId]
    );
    const user = result.rows[0];
    if (!user || !user.is_active) return { allowed: false };
    const name =
      [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.email || "";
    return { allowed: true, viewer: { name, isAdmin: user.is_admin === true } };
  } catch (error) {
    // Banco fora do ar: a tela abre e as APIs mostram o erro. O botão de envio
    // segue o token, mas a API confere a permissão de novo de qualquer forma.
    console.error("[ADS] Falha ao carregar o usuário da sessão:", error);
    return { allowed: true, viewer: { name: "", isAdmin: session.isAdmin } };
  }
}

export default async function AdsLayout({ children }: { children: ReactNode }) {
  const session = await readSession();
  const lookup: ViewerLookup = session ? await loadViewer(session) : { allowed: false };

  if (!lookup.allowed) {
    // A rota de logout limpa também um cookie inválido, evitando o ciclo
    // middleware -> login -> dashboard que ocorreria se ele ficasse no navegador.
    redirect(`/api/auth/logout?redirect=${encodeURIComponent(await requestedAdsPath())}`);
  }

  return (
    <div className="ads-root">
      <AdsShell viewer={lookup.viewer}>{children}</AdsShell>
    </div>
  );
}
