"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowLeft, LayoutDashboard, LogOut, User } from "lucide-react";

import { FnvjMark } from "@/components/tracken/BrandLogo";

import { MetaConnectedBadge } from "./_components/meta-button";
import { AdsViewerProvider, type AdsViewer } from "./_components/viewer-context";

/**
 * Moldura do /ads: barra superior com a marca, a identificação de onde a pessoa
 * está e a saída. Sem menu lateral.
 *
 * O módulo tem uma tela só desde que o envio manual de relatório saiu: os
 * números entram exclusivamente pela sincronização com a Meta. Por isso não há
 * mais abas — sobra o nome da seção, que continua sendo o caminho de volta.
 */

export default function AdsShell({ viewer, children }: { viewer: AdsViewer; children: ReactNode }) {
  const [leaving, setLeaving] = useState(false);

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
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/ads" className="flex shrink-0 items-center gap-2.5 group">
              <FnvjMark className="h-7 w-7 transition-transform group-hover:scale-105" />
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[14.5px] font-bold tracking-tight text-slate-900">Fique no Verde</span>
                  <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                    Ads
                  </span>
                </div>
              </div>
            </Link>

            <span aria-hidden className="hidden h-5 w-px bg-slate-200 sm:block" />

            <p className="hidden items-center gap-1.5 text-[13px] font-semibold text-slate-700 sm:flex">
              <LayoutDashboard className="size-3.5 text-slate-400" aria-hidden />
              Painel
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <MetaConnectedBadge className="hidden sm:inline-flex" />

            <Link
              href="/dashboard"
              className="hidden items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:border-slate-200 hover:bg-slate-100 hover:text-slate-900 sm:inline-flex"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              <span>Voltar ao sistema</span>
            </Link>

            {viewer.name ? (
              <div className="hidden items-center gap-2 rounded-full border border-slate-200/90 bg-slate-50/80 px-2.5 py-1 text-[12.5px] font-medium text-slate-700 lg:inline-flex">
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
              className="inline-flex h-8.5 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
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
