"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogOut } from "lucide-react";

import { FnvjMark } from "@/components/tracken/BrandLogo";

import { AdsViewerProvider, type AdsViewer } from "./_components/viewer-context";

/**
 * Moldura do /ads: barra superior com a marca, as duas abas (Painel e
 * Relatórios) e a saída. Sem menu lateral: o módulo tem só duas telas.
 */

const TABS = [
  { href: "/ads", label: "Painel" },
  { href: "/ads/relatorios", label: "Relatórios" },
] as const;

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative inline-flex items-center px-3 text-[14px] font-medium transition-colors ${
        active
          ? "text-[var(--ads-ink)]"
          : "text-[var(--ads-ink-muted)] hover:text-[var(--ads-ink)]"
      }`}
    >
      {label}
      {active ? (
        <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--ads-blue)]" />
      ) : null}
    </Link>
  );
}

export default function AdsShell({ viewer, children }: { viewer: AdsViewer; children: ReactNode }) {
  const pathname = usePathname();
  const [leaving, setLeaving] = useState(false);

  const isActive = (href: string) =>
    href === "/ads" ? pathname === "/ads" : pathname === href || pathname.startsWith(`${href}/`);

  const logout = async () => {
    setLeaving(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  };

  return (
    <AdsViewerProvider viewer={viewer}>
      <a
        href="#ads-conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-[14px] focus:shadow"
      >
        Pular para o conteúdo
      </a>

      <header className="border-b border-[var(--ads-line)] bg-white">
        <div className="mx-auto flex h-14 w-full max-w-[1240px] items-stretch gap-6 px-4 sm:px-6">
          <Link href="/ads" className="flex shrink-0 items-center gap-2.5">
            <FnvjMark className="h-7 w-7" />
            <span className="text-[14.5px] font-semibold text-[var(--ads-ink)]">Fique no Verde</span>
            <span aria-hidden className="hidden h-4 w-px bg-[var(--ads-line-strong)] min-[420px]:block" />
            <span className="hidden text-[14.5px] text-[var(--ads-ink-soft)] min-[420px]:inline">
              Tráfego pago
            </span>
          </Link>

          <nav aria-label="Seções do tráfego pago" className="hidden items-stretch gap-1 md:flex">
            {TABS.map((tab) => (
              <TabLink key={tab.href} href={tab.href} label={tab.label} active={isActive(tab.href)} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <Link
              href="/dashboard"
              className="hidden text-[13.5px] text-[var(--ads-ink-soft)] transition-colors hover:text-[var(--ads-ink)] sm:inline"
            >
              Voltar ao sistema
            </Link>
            {viewer.name ? (
              <span className="hidden max-w-[200px] truncate border-l border-[var(--ads-line)] pl-3 text-[13.5px] text-[var(--ads-ink-soft)] lg:inline">
                {viewer.name}
              </span>
            ) : null}
            <button
              type="button"
              onClick={logout}
              disabled={leaving}
              aria-label="Sair da conta"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13.5px] text-[var(--ads-ink-soft)] transition-colors hover:bg-[#eef0f3] hover:text-[var(--ads-ink)] disabled:opacity-60"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>

        <nav
          aria-label="Seções do tráfego pago"
          className="flex h-11 items-stretch gap-1 border-t border-[var(--ads-line)] px-1 md:hidden"
        >
          {TABS.map((tab) => (
            <TabLink key={tab.href} href={tab.href} label={tab.label} active={isActive(tab.href)} />
          ))}
          <Link
            href="/dashboard"
            className="ml-auto inline-flex items-center px-3 text-[13.5px] text-[var(--ads-ink-soft)] sm:hidden"
          >
            Sistema
          </Link>
        </nav>
      </header>

      <main
        id="ads-conteudo"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1240px] px-4 py-6 focus:outline-none sm:px-6 sm:py-8"
      >
        {children}
      </main>
    </AdsViewerProvider>
  );
}
