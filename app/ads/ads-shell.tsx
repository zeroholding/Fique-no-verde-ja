"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  ChevronRight,
  FileClock,
  Layers3,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MousePointerClick,
  UploadCloud,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Visão geral", href: "#visao-geral", icon: LayoutDashboard },
  { label: "Performance", href: "#performance", icon: BarChart3 },
  { label: "Campanhas", href: "#campanhas", icon: Megaphone },
  { label: "Estrutura", href: "#estrutura", icon: Layers3 },
  { label: "Importações", href: "#importacoes", icon: FileClock },
] as const;

type StoredUser = {
  firstName?: string;
  lastName?: string;
  email?: string;
  isAdmin?: boolean;
};

const subscribeToStorage = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};
const readStoredUser = () => window.localStorage.getItem("user");
const readStoredUserOnServer = () => null;

const NARROW_QUERY = "(max-width: 1023px)";
const subscribeToViewport = (onChange: () => void) => {
  const media = window.matchMedia(NARROW_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const readIsNarrow = () => window.matchMedia(NARROW_QUERY).matches;
const readIsNarrowOnServer = () => false;

export default function AdsShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeHash, setActiveHash] = useState("#visao-geral");
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const storedUser = useSyncExternalStore(
    subscribeToStorage,
    readStoredUser,
    readStoredUserOnServer,
  );
  const isNarrow = useSyncExternalStore(
    subscribeToViewport,
    readIsNarrow,
    readIsNarrowOnServer,
  );

  const user = useMemo<StoredUser | null>(() => {
    if (!storedUser) return null;
    try {
      return JSON.parse(storedUser) as StoredUser;
    } catch {
      return null;
    }
  }, [storedUser]);

  useEffect(() => {
    const syncHash = () => setActiveHash(window.location.hash || "#visao-geral");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (!mobileOpen || !isNarrow) return;
    const previousOverflow = document.body.style.overflow;
    lastFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";

    const focusDrawer = requestAnimationFrame(() => {
      sidebarRef.current
        ?.querySelector<HTMLElement>("[data-drawer-close]")
        ?.focus();
    });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sidebarRef.current) return;
      const focusable = Array.from(
        sidebarRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(focusDrawer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      requestAnimationFrame(() =>
        (lastFocusedRef.current ?? menuButtonRef.current)?.focus(),
      );
    };
  }, [isNarrow, mobileOpen]);

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    "Equipe Fique no Verde";
  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "FV";

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  };

  return (
    <div className="flex min-h-dvh bg-[var(--ads-canvas)] text-[var(--ads-ink)]">
      {mobileOpen ? (
        <button
          type="button"
          tabIndex={-1}
          className="fixed inset-0 z-30 bg-[#061638]/35 backdrop-blur-[2px] lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        ref={sidebarRef}
        inert={!mobileOpen && isNarrow ? true : undefined}
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh w-[264px] shrink-0 flex-col border-r border-[var(--ads-line)] bg-white shadow-[18px_0_48px_-32px_rgba(8,49,128,.3)] transition-transform duration-200 lg:sticky lg:top-0 lg:self-start lg:translate-x-0 lg:shadow-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        aria-label="Navegação do FNVJ Ads"
      >
        <div className="flex h-[72px] items-center justify-between border-b border-[var(--ads-line)] px-4">
          <Link href="/ads" className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-[var(--ads-blue)] text-white shadow-[0_8px_20px_-8px_rgba(8,102,255,.9)]">
              <MousePointerClick className="size-5" strokeWidth={2.2} aria-hidden />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[17px] font-bold tracking-[-0.025em] text-[#14223b]">
                FNVJ Ads
              </span>
              <span className="block truncate text-[12px] font-medium text-[#71809a]">
                Central de tráfego pago
              </span>
            </span>
          </Link>

          <button
            data-drawer-close
            type="button"
            onClick={() => setMobileOpen(false)}
            className="grid size-9 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="px-3 pt-5">
          <div className="rounded-2xl border border-[#dbe8ff] bg-gradient-to-br from-[#f4f8ff] to-white p-3.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f1ff] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#0757d7]">
              <span className="size-1.5 rounded-full bg-[#0866ff]" />
              Importação manual
            </span>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[#5b6b85]">
              Relatórios exportados do Meta Ads, analisados dentro do FNVJ.
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <p className="px-3 pb-2 text-[10.5px] font-bold uppercase tracking-[0.11em] text-[#9aa6b8]">
            Análise de mídia
          </p>
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeHash === item.href;
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={() => {
                      setActiveHash(item.href);
                      setMobileOpen(false);
                    }}
                    className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors ${
                      active
                        ? "bg-[#eaf2ff] font-semibold text-[#0757d7]"
                        : "font-medium text-[#66748c] hover:bg-[#f5f7fb] hover:text-[#1d2b43]"
                    }`}
                  >
                    {active ? (
                      <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[#0866ff]" />
                    ) : null}
                    <Icon
                      className={`size-[18px] ${active ? "text-[#0866ff]" : "text-[#8b98ac] group-hover:text-[#65738a]"}`}
                      strokeWidth={1.9}
                      aria-hidden
                    />
                    <span>{item.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-[var(--ads-line)] p-3">
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <Link
              href="/dashboard"
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--ads-line)] bg-white px-2 text-[12px] font-semibold text-[#5e6e86] transition hover:border-[#bdd4ff] hover:bg-[#f5f8ff] hover:text-[#0757d7]"
            >
              FNVJ <ChevronRight className="size-3.5" aria-hidden />
            </Link>
            <Link
              href="/tracken"
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--ads-line)] bg-white px-2 text-[12px] font-semibold text-[#5e6e86] transition hover:border-[#bdd4ff] hover:bg-[#f5f8ff] hover:text-[#0757d7]"
            >
              Tracken <ArrowLeftRight className="size-3.5" aria-hidden />
            </Link>
          </div>

          <div className="flex items-center gap-2.5 rounded-xl bg-[#f6f8fc] p-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#0866ff] to-[#6c5ce7] text-[12px] font-bold text-white">
              {initials}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-semibold text-[#1d2b43]">
                {displayName}
              </span>
              <span className="block truncate text-[11px] text-[#8290a5]">
                {user?.isAdmin ? "Administrador" : "Usuário FNVJ"}
              </span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="grid size-9 place-items-center rounded-lg text-[#8c99ac] transition hover:bg-white hover:text-red-600"
              aria-label="Sair da conta"
              title="Sair"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      <div
        inert={mobileOpen && isNarrow ? true : undefined}
        className="flex min-w-0 flex-1 flex-col"
      >
        <header className="sticky top-0 z-20 flex h-[64px] shrink-0 items-center gap-3 border-b border-[var(--ads-line)] bg-white/90 px-4 backdrop-blur-xl sm:px-6">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMobileOpen(true)}
            className="grid size-10 place-items-center rounded-xl text-[#68778e] transition hover:bg-[#f2f5fa] lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[#8996a9]">Fique no Verde Já</p>
            <h1 className="truncate text-[15px] font-bold tracking-[-0.015em] text-[#1a2942]">
              Central de Tráfego Pago
            </h1>
          </div>
          <span className="ml-auto hidden items-center gap-2 rounded-full border border-[#d9e6fb] bg-[#f5f8ff] px-3 py-1.5 text-[11.5px] font-semibold text-[#2861b2] sm:inline-flex">
            <UploadCloud className="size-3.5" aria-hidden />
            Dados via relatório Meta
          </span>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
