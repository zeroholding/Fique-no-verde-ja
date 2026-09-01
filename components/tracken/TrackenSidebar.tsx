"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";
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
};

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Operação",
    items: [
      {
        name: "Painel de Atendimento",
        href: "/tracken",
        icon: LayoutDashboard,
      },
      {
        name: "Atendimentos",
        href: "/tracken/atendimentos",
        icon: ListChecks,
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
      },
      {
        name: "Relatórios",
        href: "/tracken/relatorios",
        icon: FileBarChart,
      },
      {
        name: "Histórico de Status",
        href: "/tracken/historico",
        icon: History,
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
      },
      {
        name: "Configurações",
        href: "/tracken/configuracoes",
        icon: Settings,
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

/** Espelha o breakpoint `lg` do Tailwind, onde o drawer deixa de ser drawer. */
const NARROW_QUERY = "(max-width: 1023px)";

const subscribeToViewport = (onChange: () => void) => {
  const media = window.matchMedia(NARROW_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const readIsNarrow = () => window.matchMedia(NARROW_QUERY).matches;
// No servidor nao ha viewport. `false` faz a primeira renderizacao casar com o
// caso em que o menu e fixo, que e o que o HTML entrega.
const readIsNarrowOnServer = () => false;

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

  /**
   * Abaixo de `lg` o menu e um drawer sobreposto; a partir de `lg` ele e fixo.
   * A distincao importa para o `inert` e para o travamento de rolagem, que so
   * valem no modo drawer.
   */
  const isNarrow = useSyncExternalStore(
    subscribeToViewport,
    readIsNarrow,
    readIsNarrowOnServer
  );

  /**
   * Com o drawer aberto, travar a rolagem do fundo. Sem isso, arrastar sobre o
   * overlay rolava a lista de atendimentos atras do menu.
   */
  useEffect(() => {
    if (!isMobileOpen || !isNarrow) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isMobileOpen, isNarrow]);

  /** Escape fecha o drawer, como em qualquer sobreposicao. */
  useEffect(() => {
    if (!isMobileOpen) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onMobileClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isMobileOpen, onMobileClose]);

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
          className="fixed inset-0 z-30 bg-slate-900/25 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        // `inert` quando fechado no mobile: o painel continua no DOM (so sai de
        // vista por translate), entao sem isso os sete links seguiam alcancaveis
        // por Tab e o foco desaparecia da tela para dentro de um menu invisivel.
        // Em telas grandes ele nunca esta fechado, por isso a condicao olha o
        // breakpoint tambem.
        inert={!isMobileOpen && isNarrow ? true : undefined}
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-[var(--tk-line)] bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Navegação do painel TRACKen"
      >
        {/* ---------- Marca ---------- */}
        <div className="flex items-center justify-between border-b border-[var(--tk-line)] px-4 py-4">
          <Link
            href="/tracken"
            className="flex min-w-0 items-center gap-2.5 rounded-md"
            aria-label="Painel de Atendimento TRACKen"
          >
            <FnvjMark className="h-8 w-8 shrink-0" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[14.5px] font-semibold text-slate-900">
                Fique no Verde Já
              </span>
              <span className="block truncate text-[12px] font-medium text-slate-400">
                Painel TRACKen
              </span>
            </span>
          </Link>

          <button
            type="button"
            onClick={onMobileClose}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ---------- Navegação ---------- */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-4">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className={groupIndex > 0 ? "mt-5" : ""}>
              <p className="px-2.5 pb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-slate-400">
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
                        className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors ${
                          isActive
                            ? "bg-[var(--tk-brand-wash)] text-[var(--tk-brand-strong)]"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        }`}
                      >
                        {isActive && (
                          <span
                            className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--tk-brand)]"
                            aria-hidden="true"
                          />
                        )}
                        <Icon
                          className={`h-[17px] w-[17px] shrink-0 ${
                            isActive
                              ? "text-[var(--tk-brand)]"
                              : "text-slate-400 group-hover:text-slate-600"
                          }`}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        <span
                          className={`min-w-0 flex-1 truncate text-[14.5px] ${
                            isActive ? "font-semibold" : "font-medium"
                          }`}
                        >
                          {item.name}
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
        <div className="border-t border-[var(--tk-line)] p-2.5">
          <Link
            href="/dashboard"
            className="mb-1.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
          >
            <ArrowLeftRight
              className="h-4 w-4 shrink-0 text-slate-400"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Sistema completo FNVJ
            <ChevronRight
              className="ml-auto h-3.5 w-3.5 text-slate-300"
              aria-hidden="true"
            />
          </Link>

          <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-2.5 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5ec624] to-[#048842] text-[12.5px] font-bold text-white">
              {initials}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[14px] font-semibold text-slate-900">
                {displayName}
              </span>
              <span className="block truncate text-[12px] text-slate-500">
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
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
