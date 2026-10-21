import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";

import "./live.css";

/**
 * Painel ao vivo (/live): tela de TV, sem menu lateral.
 *
 * As fontes são as da marca (as mesmas da landing): Outfit nos números e
 * títulos, Plus Jakarta Sans nos textos. O portão de acesso (só administrador)
 * fica em page.tsx.
 */

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-live-display",
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-live-texto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ao vivo | Fique no Verde Já",
  description: "Painel ao vivo de atendimentos realizados",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function LiveLayout({ children }: { children: ReactNode }) {
  return <div className={`${outfit.variable} ${plusJakarta.variable}`}>{children}</div>;
}
