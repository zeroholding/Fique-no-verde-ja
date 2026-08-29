"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";
import {
  ArrowLeftRight,
  Building2,
  ChevronRight,
  FileBarChart,
  Gauge,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Settings,
  X,
} from "lucide-react";
import { FnvjMark } from "./BrandLogo";

/**
 * Navegacao do painel.
 *
 * Escura de proposito, com o conteudo claro ao lado: separa "onde estou" de "o
 * que estou lendo" sem precisar de moldura, e e o arranjo de painel operacional
 * que a equipe reconhece de outras ferramentas.
 *
 * Os itens sao agrupados por proposito. Sete links numa lista corrida nao dizem
 * nada; agrupados, dizem onde procurar.
 */

type NavItem = {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  /** Rotulo curto do que a tela entrega. */
  hint: string;
};

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Operação",
    items: [
      {
        name: "Painel de Atendimento",
        href: "/tracken",
        icon: LayoutDashboard,
        hint: "Visão do dia",
      },
      {
        name: "Atendimentos",
        href: "/tracken/atendimentos",
        icon: ListChecks,
        hint: "Fila completa",
      },
    ],
  },
  {
    label: "Análise",
    items: [
      {
        name: "SLA & Performance",
        href: "/tracken/sla",
        icon: Gauge,
        hint: "Cumprimento de prazo",
      },
      {
        name: "Relatórios",
        href: "/tracken/relatorios",
        icon: FileBarChart,
        hint: "Consolidado e exportação",
      },
      {
        name: "Histórico de Status",
        href: "/tracken/historico",
        icon: History,
        hint: "Trilha de auditoria",
      },
    ],
  },
  {
    label: "Cadastros",
    items: [
      {
        name: "Transportadoras",
        href: "/tracken/transportadoras",
        icon: Building2,
        hint: "Volume e badges",
      },
      {
        name: "Configurações",
        href: "/tracken/configuracoes",
        icon: Settings,
        hint: "API, status e fila",
      },
    ],
  },
];

type SidebarUser = {
  firstName?: string;
  lastName?: string;
  email?: string;
  isAdmin?: boolean;
};

/**
 * O usuario vem do localStorage gravado no login, como no Sidebar do dashboard.
 * A leitura usa `useSyncExternalStore` em vez de `useEffect` + `setState`: o
 * snapshot do servidor e nulo, entao a hidratacao casa e nao ha render em
 * cascata.
 */
const subscribeToNothing = () => () => {};
const readStoredUser = () => window.localStorage.getItem("user");
const readStoredUserOnServer = () => null;

export default function TrackenSidebar({
  isMobileOpen,
  onMobileClose,
}: {
  isMobileOpen: boolean;
  onMobileClose: () => void;
}) {
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
    window.location.href = "/tracken/login";
  };

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    "Equipe Fique no Verde";
  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "FV";

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-[#10151f]/60 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[268px] flex-col bg-[var(--tk-nav)] transition-transform duration-200 lg:static lg:translate-x-0 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Navegação do painel TRACKen"
      >
        {/* ---------- Marca ---------- */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <Link
            href="/tracken"
            className="flex min-w-0 items-center gap-3 rounded-md"
            aria-label="Painel de Atendimento TRACKen"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-inset ring-white/10">
              <FnvjMark className="h-6 w-6" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-semibold text-white">
                Fique no Verde Já
              </span>
              <span className="block truncate text-[11px] text-white/45">
                Painel TRACKen
              </span>
            </span>
          </Link>

          <button
            type="button"
            onClick={onMobileClose}
            className="rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ---------- Navegação ---------- */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className={groupIndex > 0 ? "mt-6" : ""}>
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">
                {group.label}
              </p>

              <ul className="space-y-0.5">
                {group.items.map((item) => {
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
                        className={`group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                          isActive
                            ? "tk-nav-active bg-white/[0.08] text-white"
                            : "text-white/60 hover:bg-white/[0.04] hover:text-white/90"
                        }`}
                      >
                        <Icon
                          className={`h-[17px] w-[17px] shrink-0 ${
                            isActive
                              ? "text-green-400"
                              : "text-white/40 group-hover:text-white/70"
                          }`}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block truncate text-[13px] font-medium">
                            {item.name}
                          </span>
                          <span
                            className={`block truncate text-[10.5px] ${
                              isActive ? "text-white/45" : "text-white/25"
                            }`}
                          >
                            {item.hint}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* ---------- Rodapé ---------- */}
        <div className="border-t border-white/[0.07] p-3">
          <Link
            href="/dashboard"
            className="mb-2 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-medium text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white/80"
          >
            <ArrowLeftRight
              className="h-4 w-4 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Sistema completo FNVJ
            <ChevronRight className="ml-auto h-3.5 w-3.5" aria-hidden="true" />
          </Link>

          <div className="flex items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5ec624] to-[#048842] text-[11px] font-bold text-white">
              {initials}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[12.5px] font-medium text-white">
                {displayName}
              </span>
              <span className="block truncate text-[10.5px] text-white/40">
                {user?.isAdmin ? "Administrador" : "Atendente"}
              </span>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md p-1.5 text-white/35 transition-colors hover:bg-white/10 hover:text-red-300"
              aria-label="Sair da conta"
              title="Sair"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
