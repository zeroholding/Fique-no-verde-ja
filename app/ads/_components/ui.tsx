"use client";

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

/**
 * Peças visuais do /ads. Visual profissional, clean e refinado:
 * bordas nítidas, sombras suaves, sem emojis, 100% ícones SVG.
 */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-blue-600 text-white shadow-xs hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 disabled:shadow-none",
  secondary:
    "border-slate-200 bg-white text-slate-800 shadow-xs hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 disabled:text-slate-400 disabled:border-slate-100",
  ghost:
    "border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-400",
  danger:
    "border-transparent bg-rose-600 text-white shadow-xs hover:bg-rose-700 active:bg-rose-800 disabled:bg-rose-300",
};

export function buttonClasses(variant: ButtonVariant = "secondary", size: "sm" | "md" = "md"): string {
  const sizing = size === "sm" ? "h-8 px-2.5 text-[12.5px] rounded-lg" : "h-9.5 px-3.5 text-[13.5px] rounded-lg";
  return `inline-flex shrink-0 items-center justify-center gap-1.5 border font-semibold tracking-tight transition-all duration-150 disabled:cursor-not-allowed cursor-pointer ${sizing} ${BUTTON_VARIANTS[variant]}`;
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button type={type} className={`${buttonClasses(variant, size)} ${className}`} {...props} />;
}

export function Card({
  children,
  className = "",
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
  "aria-labelledby"?: string;
  "aria-busy"?: boolean;
}) {
  return (
    <Tag
      className={`rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] transition-shadow ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  titleId,
  description,
  actions,
}: {
  title: string;
  titleId?: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <h2 id={titleId} className="text-[15.5px] font-bold tracking-tight text-slate-900">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-[13px] text-slate-500 font-normal">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

type NoticeTone = "info" | "warning" | "error" | "success";

const NOTICE_STYLES: Record<NoticeTone, { box: string; icon: typeof Info }> = {
  info: { box: "border-blue-200/80 bg-blue-50/70 text-blue-900", icon: Info },
  warning: { box: "border-amber-200/80 bg-amber-50/70 text-amber-900", icon: AlertCircle },
  error: { box: "border-rose-200/80 bg-rose-50/70 text-rose-900", icon: AlertCircle },
  success: { box: "border-emerald-200/80 bg-emerald-50/70 text-emerald-900", icon: CheckCircle2 },
};

export function Notice({
  tone = "info",
  children,
  action,
  className = "",
}: {
  tone?: NoticeTone;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const style = NOTICE_STYLES[tone];
  const Icon = style.icon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-xl border p-3.5 text-[13.5px] leading-relaxed shadow-xs ${style.box} ${className}`}
    >
      <Icon className="mt-0.5 size-4.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 font-medium">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg className="size-4 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {label ? <span className="font-medium">{label}</span> : null}
    </span>
  );
}

/**
 * Modal nativo (`<dialog>` + `showModal`) estilizado com backdrop blur
 * e fechamento acessível.
 */
export function Dialog({
  title,
  description,
  children,
  footer,
  onClose,
  dismissable = true,
  size = "md",
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  dismissable?: boolean;
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);
  const dismissableRef = useRef(dismissable);

  useEffect(() => {
    onCloseRef.current = onClose;
    dismissableRef.current = dismissable;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();

    const handleCancel = (event: Event) => {
      event.preventDefault();
      if (dismissableRef.current) onCloseRef.current();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      if (dialog.open) dialog.close();
      previous?.focus();
    };
  }, []);

  const width = size === "lg" ? "w-[min(760px,calc(100vw-2rem))]" : "w-[min(540px,calc(100vw-2rem))]";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={`m-auto max-h-[calc(100dvh-2rem)] ${width} overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-0 text-slate-900 shadow-[0_25px_60px_-15px_rgba(15,23,42,0.3)] animate-in fade-in-0 zoom-in-95`}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4.5 bg-slate-50/50">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[17px] font-bold tracking-tight text-slate-900">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-0.5 text-[13.5px] text-slate-500 font-normal">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissable}
            className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-800 disabled:opacity-40"
            aria-label="Fechar"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50/80 px-6 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
