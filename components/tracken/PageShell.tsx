"use client";

import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatNumber } from "@/lib/tracken/format";
import { KPI_ICON_CLASSES, normalizeColor } from "./tokens";

/** Estrutura comum das telas do painel, para as 7 paginas ficarem coerentes. */

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}
    >
      {(title || actions) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            )}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

export function LoadingState({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  icon: Icon = Inbox,
}: {
  title: string;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="px-4 py-16 text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-slate-300" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/** Indicador compacto, para as telas secundarias. */
export function StatTile({
  label,
  value,
  hint,
  color,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  color?: string | null;
  icon?: LucideIcon;
}) {
  const tone = normalizeColor(color);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        {Icon && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${KPI_ICON_CLASSES[tone]}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Barra de progresso horizontal com rotulo, usada nas telas de SLA e volume. */
export function ProgressRow({
  label,
  sublabel,
  value,
  max,
  color,
  right,
}: {
  label: string;
  sublabel?: string;
  value: number;
  max: number;
  color?: string | null;
  right?: React.ReactNode;
}) {
  const tone = normalizeColor(color);
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  const barClasses: Record<string, string> = {
    green: "bg-green-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    purple: "bg-purple-500",
    slate: "bg-slate-400",
  };

  return (
    <li>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate font-medium text-slate-700">
          {label}
          {sublabel && (
            <span className="ml-1 font-normal text-slate-400">{sublabel}</span>
          )}
        </span>
        <span className="shrink-0 tabular-nums font-semibold text-slate-900">
          {right ?? formatNumber(value)}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${barClasses[tone]}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </li>
  );
}

/** Formata minutos em texto legivel (usado nos tempos medios). */
export function formatDuration(minutes: number | null): string {
  if (minutes === null || Number.isNaN(minutes)) return "-";
  if (minutes < 60) return `${Math.round(minutes)} min`;

  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1).replace(".", ",")} h`;

  return `${(hours / 24).toFixed(1).replace(".", ",")} dias`;
}
