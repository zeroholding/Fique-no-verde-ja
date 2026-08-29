"use client";

import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatNumber } from "@/lib/tracken/format";
import { normalizeColor, type TrackenColor } from "./tokens";

/** Estrutura comum das telas, para as sete ficarem coerentes entre si. */

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
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
      <div className="min-w-0">
        <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-slate-900 sm:text-[22px]">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500">
          {subtitle}
        </p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
  padded = true,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`tk-card tk-raised overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-[var(--tk-line)] px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13px] font-semibold text-slate-900">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-[11.5px] text-slate-500">{description}</p>
            )}
          </div>
          {actions}
        </div>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-4 flex items-start gap-2.5 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800"
    >
      <AlertCircle
        className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      {message}
    </p>
  );
}

export function LoadingState({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-16 text-[13px] text-slate-500">
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
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100">
        <Icon
          className="h-5 w-5 text-slate-400"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </span>
      <p className="text-[13.5px] font-semibold text-slate-800">{title}</p>
      {hint && (
        <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-slate-500">
          {hint}
        </p>
      )}
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

  const tint: Record<TrackenColor, string> = {
    green: "text-green-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
    red: "text-red-600",
    purple: "text-purple-600",
    slate: "text-slate-400",
  };

  return (
    <div className="tk-card px-4 pb-3.5 pt-4">
      <div className="flex items-start justify-between gap-2">
        <span className="tk-eyebrow">{label}</span>
        {Icon && (
          <Icon
            className={`h-4 w-4 shrink-0 ${tint[tone]}`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
      </div>
      <p className="tk-num mt-2.5 text-[24px] font-semibold leading-none text-slate-900">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {hint && <p className="mt-1.5 text-[11.5px] text-slate-500">{hint}</p>}
    </div>
  );
}

/** Barra horizontal com rotulo, usada nas telas de SLA e volume. */
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

  const bar: Record<TrackenColor, string> = {
    green: "bg-green-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    purple: "bg-purple-500",
    slate: "bg-slate-400",
  };

  return (
    <li>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[12.5px] font-medium text-slate-700">
          {label}
          {sublabel && (
            <span className="ml-1.5 font-normal text-slate-400">{sublabel}</span>
          )}
        </span>
        <span className="tk-num shrink-0 text-[12.5px] font-semibold text-slate-900">
          {right ?? formatNumber(value)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${bar[tone]}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </li>
  );
}

/** Formata minutos em texto legivel (usado nos tempos medios). */
export function formatDuration(minutes: number | null): string {
  if (minutes === null || Number.isNaN(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;

  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1).replace(".", ",")} h`;

  return `${(hours / 24).toFixed(1).replace(".", ",")} dias`;
}

/** Botao primario e secundario, para as telas nao divergirem de estilo. */
export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-2 rounded-lg bg-[var(--tk-brand-strong)] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#036c35] disabled:cursor-not-allowed disabled:opacity-60 ${
        props.className ?? ""
      }`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-2 rounded-lg border border-[var(--tk-line-strong)] bg-white px-3.5 py-2 text-[12.5px] font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 ${
        props.className ?? ""
      }`}
    >
      {children}
    </button>
  );
}
