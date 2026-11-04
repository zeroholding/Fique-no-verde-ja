"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArrowLeft, FileSpreadsheet, LayoutDashboard, LogOut, User } from "lucide-react";

import { FnvjMark } from "@/components/tracken/BrandLogo";

import { AdsViewerProvider, type AdsViewer } from "./_components/viewer-context";

/**
 * Moldura do /ads: barra superior com a marca, as duas abas (Painel e
 * Relatórios) e a saída. Sem menu lateral, com estética limpa e profissional.
 */

const TABS = [
  { href: "/ads", label: "Painel", icon: LayoutDashboard },
  { href: "/ads/relatorios", label: "Relatórios", icon: FileSpreadsheet },
] as const;

function TabLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative inline-flex items-center gap-2 px-3.5 py-1.5 text-[13.5px] font-semibold transition-all duration-150 rounded-lg ${
        active
          ? "bg-blue-50/80 text-blue-700 shadow-xs border border-blue-100/60"
          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
      }`}
    >
      <Icon className={`size-4 transition-colors ${active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"}`} aria-hidden />
      <span>{label}</span>
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
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-[14px] focus:shadow-md focus:border focus:border-slate-200"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-15 w-full max-w-[1360px] items-center justify-between gap-6 px-4 sm:px-6">
          {/* Logo & Seções */}
          <div className="flex items-center gap-6">
            <Link href="/ads" className="flex shrink-0 items-center gap-2.5 group">
              <FnvjMark className="h-7 w-7 transition-transform group-hover:scale-105" />
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[14.5px] font-bold tracking-tight text-slate-900">Fique no Verde</span>
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-100">
                    Ads
                  </span>
                </div>
              </div>
            </Link>

            <span aria-hidden className="hidden h-5 w-px bg-slate-200 sm:block" />

            <nav aria-label="Seções do tráfego pago" className="hidden items-center gap-1.5 md:flex">
              {TABS.map((tab) => (
                <TabLink key={tab.href} href={tab.href} label={tab.label} icon={tab.icon} active={isActive(tab.href)} />
              ))}
            </nav>
          </div>

          {/* Ações à direita */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 border border-transparent hover:border-slate-200"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              <span>Voltar ao sistema</span>
            </Link>

            {viewer.name ? (
              <div className="hidden lg:inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-slate-50/80 px-2.5 py-1 text-[12.5px] font-medium text-slate-700">
                <span className="grid size-5.5 place-items-center rounded-full bg-slate-200 text-slate-700">
                  <User className="size-3" aria-hidden />
                </span>
                <span className="max-w-[150px] truncate">{viewer.name}</span>
                {viewer.isAdmin ? (
                  <span className="rounded bg-blue-100/80 px-1.5 py-0.2 text-[10px] font-semibold text-blue-700">
                    Admin
                  </span>
                ) : null}
              </div>
            ) : null}

            <button
              type="button"
              onClick={logout}
              disabled={leaving}
              aria-label="Sair da conta"
              className="inline-flex h-8.5 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        <nav
          aria-label="Seções do tráfego pago móvel"
          className="flex h-11 items-center justify-between border-t border-slate-200/80 bg-slate-50/60 px-3 md:hidden"
        >
          <div className="flex items-center gap-1">
            {TABS.map((tab) => (
              <TabLink key={tab.href} href={tab.href} label={tab.label} icon={tab.icon} active={isActive(tab.href)} />
            ))}
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12.5px] font-medium text-slate-600 sm:hidden"
          >
            <ArrowLeft className="size-3" aria-hidden />
            <span>Sistema</span>
          </Link>
        </nav>
      </header>

      <main
        id="ads-conteudo"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1360px] px-4 py-6 focus:outline-none sm:px-6 sm:py-8"
      >
        {children}
      </main>
    </AdsViewerProvider>
  );
}
