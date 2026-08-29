"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";
import {
  BarChart3,
  Building2,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  LogOut,
  Settings,
  X,
} from "lucide-react";
import { FnvjMark } from "./BrandLogo";

/** Itens do menu do painel, na ordem aprovada no mockup. */
const MENU_ITEMS = [
  {
    name: "Painel de Atendimento",
    href: "/tracken",
    icon: LayoutDashboard,
  },
  {
    name: "Atendimentos",
    href: "/tracken/atendimentos",
    icon: BarChart3,
  },
  {
    name: "Transportadoras",
    href: "/tracken/transportadoras",
    icon: Building2,
  },
  {
    name: "Relatorios",
    href: "/tracken/relatorios",
    icon: FileText,
  },
  {
    name: "Historico de Status",
    href: "/tracken/historico",
    icon: History,
  },
  {
    name: "SLA & Performance",
    href: "/tracken/sla",
    icon: Gauge,
  },
  {
    name: "Configuracoes",
    href: "/tracken/configuracoes",
    icon: Settings,
  },
];

type SidebarUser = {
  firstName?: string;
  lastName?: string;
  email?: string;
  isAdmin?: boolean;
};

type Props = {
  isMobileOpen: boolean;
  onMobileClose: () => void;
};

/**
 * O usuario vem do localStorage gravado no login, como no Sidebar do
 * dashboard, evitando uma chamada de rede a cada navegacao.
 *
 * A leitura usa `useSyncExternalStore` em vez de `useEffect` + `setState`:
 * o snapshot do servidor e nulo, entao a hidratacao casa e nao ha render
 * em cascata.
 */
const subscribeToNothing = () => () => {};
const readStoredUser = () => window.localStorage.getItem("user");
const readStoredUserOnServer = () => null;

export default function TrackenSidebar({ isMobileOpen, onMobileClose }: Props) {
  const pathname = usePathname();

  const storedUser = useSyncExternalStore(
    subscribeToNothing,
    readStoredUser,
    readStoredUserOnServer
  );

  const user = useMemo<SidebarUser | null>(() => {
    if (!storedUser) return null;
    try {
      return JSON.parse(storedUser) as SidebarUser;
    } catch {
      return null;
    }
  }, [storedUser]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Segue para o login mesmo se a chamada falhar.
    }
    window.localStorage.removeItem("user");
    window.localStorage.removeItem("token");
    // Volta para a porta de entrada do painel, nao para a do sistema completo.
    window.location.href = "/tracken/login";
  };

  const displayName = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Menu do painel Tracken"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5">
          <Link
            href="/tracken"
            className="flex min-w-0 items-center gap-2.5"
            aria-label="Painel de Atendimento TRACKen"
          >
            <FnvjMark className="h-9 w-9 shrink-0" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-bold text-slate-900">
                Fique no <span className="text-green-600">Verde Já</span>
              </span>
              <span className="block truncate text-[11px] font-medium text-slate-400">
                Painel TRACKen
              </span>
            </span>
          </Link>

          <button
            type="button"
            onClick={onMobileClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {MENU_ITEMS.map((item) => {
              const isActive =
                item.href === "/tracken"
                  ? pathname === "/tracken"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onMobileClose}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      isActive
                        ? "bg-green-50 font-semibold text-green-700"
                        : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 shrink-0 ${
                        isActive ? "text-green-600" : "text-slate-400"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-semibold text-white">
              {(user?.firstName?.[0] ?? "F").toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-slate-900">
                {displayName || "Equipe Fique no Verde Ja"}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {user?.isAdmin ? "Administrador" : "Atendente"}
              </span>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-red-600"
              aria-label="Sair da conta"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          <Link
            href="/dashboard"
            className="mt-2 block rounded-lg px-3 py-2 text-center text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            Voltar ao painel FNVJ
          </Link>
        </div>
      </aside>
    </>
  );
}
