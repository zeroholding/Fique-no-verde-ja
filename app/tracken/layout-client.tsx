"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import TrackenSidebar from "@/components/tracken/TrackenSidebar";

export default function TrackenLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <button
        type="button"
        onClick={() => setIsMobileSidebarOpen(true)}
        className="fixed left-4 top-4 z-20 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <TrackenSidebar
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />

      <main className="flex-1 overflow-x-hidden pt-16 lg:pt-0">{children}</main>
    </div>
  );
}
