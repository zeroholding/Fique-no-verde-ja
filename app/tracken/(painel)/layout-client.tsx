"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Menu, PanelsTopLeft } from "lucide-react";
import TrackenSidebar from "@/components/tracken/TrackenSidebar";

/**
 * Casca das telas autenticadas.
 *
 * A barra superior existe para responder "onde estou" em uma linha, sem que
 * cada tela precise repetir o caminho. Ela e fina de proposito: o espaco
 * vertical pertence aos dados.
 */

const BREADCRUMBS: Record<string, string> = {
  "/tracken": "Painel de Atendimento",
  "/tracken/atendimentos": "Atendimentos",
  "/tracken/transportadoras": "Transportadoras",
  "/tracken/relatorios": "Relatórios",
  "/tracken/historico": "Histórico de Status",
  "/tracken/sla": "SLA & Performance",
  "/tracken/configuracoes": "Configurações",
};

export default function TrackenLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const pathname = usePathname();

  const current = BREADCRUMBS[pathname] ?? "Painel";
  const isRoot = pathname === "/tracken";

  return (
    <div className="flex min-h-screen bg-[var(--tk-canvas)]">
      <TrackenSidebar
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--tk-line)] bg-white/85 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            className="-ml-1 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>

          <nav aria-label="Caminho" className="flex min-w-0 items-center gap-1.5">
            <Link
              href="/tracken"
              className="flex shrink-0 items-center gap-1.5 rounded-md text-[14px] font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              <PanelsTopLeft
                className="h-[15px] w-[15px]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">TRACKen</span>
            </Link>

            {!isRoot && (
              <>
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-slate-300"
                  aria-hidden="true"
                />
                <span className="truncate text-[14px] font-semibold text-slate-900">
                  {current}
                </span>
              </>
            )}
          </nav>

          <span className="ml-auto hidden items-center gap-2 rounded-full bg-[var(--tk-brand-wash)] px-2.5 py-1 text-[12.5px] font-medium text-[var(--tk-brand-strong)] sm:flex">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--tk-brand)]"
              aria-hidden="true"
            />
            Integração ativa
          </span>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
