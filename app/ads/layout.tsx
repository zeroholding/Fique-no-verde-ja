import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";

import AdsShell from "./ads-shell";

/**
 * O Ads usa exatamente a mesma sessão do FNVJ e do Tracken.
 *
 * Não existe segundo login, token próprio ou banco separado. O middleware faz a
 * triagem rápida pela presença do cookie e este layout valida a assinatura antes
 * de entregar qualquer tela do módulo.
 */
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const secret = new TextEncoder().encode(JWT_SECRET);

export const metadata: Metadata = {
  title: "FNVJ Ads — Tráfego Pago",
  description: "Análise de relatórios exportados do Meta Ads",
};

async function hasValidSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return false;

  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export default async function AdsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await hasValidSession())) {
    // A rota de logout limpa também um cookie inválido, evitando o ciclo
    // middleware -> login -> dashboard que ocorreria se ele ficasse no navegador.
    redirect("/api/auth/logout?redirect=%2Fads");
  }

  return (
    <div className="ads-root">
      <AdsShell>{children}</AdsShell>
    </div>
  );
}
