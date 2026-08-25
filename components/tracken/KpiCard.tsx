"use client";

import type { LucideIcon } from "lucide-react";
import { formatNumber } from "@/lib/tracken/format";
import { KPI_ICON_CLASSES, normalizeColor } from "./tokens";

type Props = {
  title: string;
  value: number;
  hint: string;
  color?: string | null;
  icon: LucideIcon;
  isActive?: boolean;
  onClick?: () => void;
};

/** Cartao de indicador. Clicavel: aplica o filtro de status correspondente. */
export default function KpiCard({
  title,
  value,
  hint,
  color,
  icon: Icon,
  isActive = false,
  onClick,
}: Props) {
  const tone = normalizeColor(color);

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-slate-500">{title}</span>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${KPI_ICON_CLASSES[tone]}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">
        {formatNumber(value)}
      </p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </>
  );

  const baseClasses = `rounded-xl border bg-white p-4 text-left shadow-sm transition-all ${
    isActive
      ? "border-green-400 ring-2 ring-green-100"
      : "border-slate-200"
  }`;

  if (!onClick) {
    return <div className={baseClasses}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`${baseClasses} hover:border-slate-300 hover:shadow focus:outline-none focus:ring-2 focus:ring-green-200`}
    >
      {content}
    </button>
  );
}
