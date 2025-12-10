"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import clsx from "clsx";

interface MenuItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
}

interface TooltipState {
  top: number;
  left: number;
  label: string;
  badge?: string;
}

const defaultMenuItems: MenuItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    name: "Vendas",
    href: "/dashboard/sales",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    name: "Estornos",
    href: "/dashboard/refunds",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 00-3-3m0 0a3 3 0 00-3 3m3-3V5m0 7v7m-4-3H5a2 2 0 01-2-2V7a2 2 0 012-2h14a2 2 0 012 2v2" />
      </svg>
    ),
  },
  {
    name: "Comissoes",
    href: "/dashboard/commissions",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13h2l2.5-6 2 12 2-8 1 4h7" />
      </svg>
    ),
  },
  {
    name: "Pacotes (Extrato)",
    href: "/dashboard/packages/statement",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 8h14M5 16h10" />
      </svg>
    ),
  },
  {
    name: "Pacotes (Contas)",
    href: "/dashboard/packages",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
      </svg>
    ),
  },
  {
    name: "Clientes",
    href: "/dashboard/clients",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    name: "Servicos",
    href: "/dashboard/services",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2" />
      </svg>
    ),
  },
  {
    name: "Integrações",
    href: "/dashboard/integrations",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
      </svg>
    ),
  },
  {
    name: "Reputação",
    href: "/dashboard/reputation",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
  },
];

const adminMenuItems: MenuItem[] = [
  {
    name: "Visao Geral",
    href: "/dashboard/admin",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    name: "Usuarios",
    href: "/dashboard/admin/users",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 11a4 4 0 100-8 4 4 0 000 8zm0 0a9 9 0 00-9 9v1h9m7-13a4 4 0 110 8" />
      </svg>
    ),
  },
  {
    name: "Servicos",
    href: "/dashboard/admin/services",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2" />
      </svg>
    ),
  },
  {
    name: "Comissoes",
    href: "/dashboard/admin/commissions",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l2 2 4-4m4 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    name: "Origens",
    href: "/dashboard/admin/origins",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
  },
];

type SidebarUser = {
  firstName: string;
  lastName: string;
  email: string;
  isAdmin?: boolean;
};

interface SidebarProps {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const Sidebar = ({ isMobileOpen = false, onMobileClose }: SidebarProps) => {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [user, setUser] = useState<SidebarUser | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const isAdminView = (pathname ?? "").startsWith("/dashboard/admin");
  const activeMenuItems =
    user?.isAdmin && isAdminView ? adminMenuItems : defaultMenuItems;

useEffect(() => {
  const raf = requestAnimationFrame(() => {
    const collapsedState = localStorage.getItem("sidebar:collapsed");
    if (collapsedState !== null) {
      setIsCollapsed(collapsedState === "true");
    }

    const userData = localStorage.getItem("user");
    if (!userData) {
      return;
    }

    try {
      const parsedUser: SidebarUser = JSON.parse(userData);
      setUser(parsedUser);
    } catch {
      localStorage.removeItem("user");
    }
  });

  return () => cancelAnimationFrame(raf);
}, []);

useEffect(() => {
  const raf = requestAnimationFrame(() => {
    localStorage.setItem("sidebar:collapsed", String(isCollapsed));
  });

  return () => cancelAnimationFrame(raf);
}, [isCollapsed]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!tooltip) {
      return;
    }

    const dismissTooltip = () => setTooltip(null);
    window.addEventListener("scroll", dismissTooltip, true);
    window.addEventListener("resize", dismissTooltip);

    return () => {
      window.removeEventListener("scroll", dismissTooltip, true);
      window.removeEventListener("resize", dismissTooltip);
    };
  }, [tooltip]);

  useEffect(() => {
    if (!isCollapsed) {
      const raf = requestAnimationFrame(() => setTooltip(null));
      return () => cancelAnimationFrame(raf);
    }
  }, [isCollapsed]);

  const showTooltip = (
    event: React.MouseEvent<HTMLElement>,
    content: { label: string; badge?: string }
  ) => {
    if (!isCollapsed) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
      label: content.label,
      badge: content.badge,
    });
  };

  const hideTooltip = () => setTooltip(null);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Erro ao sair", error);
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
  };

  const handleLinkClick = () => {
    // Fecha a sidebar em mobile quando clicar em um link
    if (onMobileClose) {
      onMobileClose();
    }
  };

  return (
    <>
      {/* Backdrop para mobile */}
      {isMobileOpen && isMounted && createPortal(
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onMobileClose}
        />,
        document.body
      )}

      {/* Sidebar */}
      <div
        className={clsx(
          "min-h-screen flex flex-col transition-all duration-300 relative bg-black/20 backdrop-blur-xl border-r border-white/10 shadow-2xl overflow-visible",
          // Desktop behavior
          "lg:relative lg:z-20",
          isCollapsed ? "lg:w-20" : "lg:w-80",
          // Mobile behavior
          "fixed z-50 w-80 top-0 left-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Área clicável invisível na borda (apenas desktop) */}
        <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="hidden lg:block absolute right-0 top-0 bottom-0 w-1 z-10 cursor-pointer hover:w-2 transition-all"
        style={{
          background: "transparent",
        }}
      />

      {/* Botão de fechar (apenas mobile) */}
      <button
        onClick={onMobileClose}
        className="lg:hidden absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors z-10"
      >
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Header com Logo e User Info */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl overflow-hidden border border-white/20 flex-shrink-0 relative">
            <Image
              src="/logo.jpg"
              alt="Logo"
              fill
              sizes="48px"
              className="object-cover"
              priority
            />
          </div>
          {!isCollapsed && user && (
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold text-sm truncate">
                {user.firstName} {user.lastName}
              </h3>
              <p className="text-gray-400 text-xs truncate">{user.email}</p>
            </div>
          )}
        </div>
      </div>

      {/* Menu Items */}
      <div className="flex-1 overflow-y-auto overflow-x-visible">
        <nav className="px-4 py-2 space-y-2">
          {user?.isAdmin && (
            <Link
              href={isAdminView ? "/dashboard" : "/dashboard/admin"}
              onClick={handleLinkClick}
              className={clsx(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all border border-white/10",
                isCollapsed ? "justify-center" : "",
                isAdminView
                  ? "bg-orange-500/10 text-orange-200"
                  : "bg-white/5 text-white hover:bg-white/10"
              )}
              onMouseEnter={(event) =>
                showTooltip(event, {
                  label: isAdminView ? "Voltar ao Dashboard" : "Área Administrativa",
                })
              }
              onMouseLeave={hideTooltip}
            >
              <div className="flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c1.657 0 3-1.57 3-3.5S13.657 4 12 4s-3 1.57-3 3.5S10.343 11 12 11z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.5 20a6.5 6.5 0 0113 0" />
                </svg>
              </div>
              {!isCollapsed && (
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">
                    {isAdminView ? "Voltar ao Dashboard" : "Área Administrativa"}
                  </span>
                  {!isAdminView && <span className="text-xs text-gray-300">Acesso para administradores</span>}
                </div>
              )}
            </Link>
          )}

          {activeMenuItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleLinkClick}
                className={clsx(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all z-50",
                  isCollapsed ? "justify-center relative" : "relative",
                  isActive
                    ? "bg-white/15 text-white"
                    : "text-gray-400 hover:bg-white/10 hover:text-white"
                )}
                style={{ isolation: "isolate" }}
                onMouseEnter={(event) =>
                  showTooltip(event, { label: item.name, badge: item.badge })
                }
                onMouseLeave={hideTooltip}
              >
                <div className="flex-shrink-0">{item.icon}</div>
                {!isCollapsed && (
                  <>
                    <span className="text-sm font-medium flex-1">
                      {item.name}
                    </span>
                    {item.badge && (
                      <span className="text-[10px] px-2 py-1 rounded-lg bg-orange-500/20 text-orange-300 border border-orange-500/30">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Logout Button */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className={clsx(
            "w-full px-4 py-3 rounded-xl transition-all text-gray-400 hover:bg-red-500/20 hover:text-red-300 flex items-center gap-3 relative z-50",
            isCollapsed ? "justify-center" : ""
          )}
          style={{ isolation: "isolate" }}
          onMouseEnter={(event) =>
            showTooltip(event, { label: "Sair" })
          }
          onMouseLeave={hideTooltip}
        >
          <svg
            className="w-5 h-5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          {!isCollapsed && <span className="text-sm font-medium">Sair</span>}
        </button>
      </div>
      </div>

      {isMounted &&
        tooltip &&
        createPortal(
          <div
            className="fixed pointer-events-none px-4 py-2.5 rounded-xl bg-black/30 backdrop-blur-xl border border-white/10 shadow-2xl whitespace-nowrap z-[9999]"
            style={{
              top: tooltip.top,
              left: tooltip.left,
              transform: "translateY(-50%)",
            }}
          >
            <span className="text-sm font-medium text-white">
              {tooltip.label}
            </span>
            {tooltip.badge && (
              <span className="ml-2 text-[10px] px-2 py-1 rounded-lg bg-orange-500/20 text-orange-300 border border-orange-500/30">
                {tooltip.badge}
              </span>
            )}
          </div>,
          document.body
        )}
    </>
  );
};

