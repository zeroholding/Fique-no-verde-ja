"use client";

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

/**
 * Peças visuais do /ads. Visual sóbrio de propósito: borda fina, cantos
 * discretos, sem gradiente, sombra pesada ou selo decorativo.
 */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-[var(--ads-blue)] text-white hover:bg-[var(--ads-blue-strong)] disabled:bg-[#9db7f0]",
  secondary:
    "border-[var(--ads-line-strong)] bg-white text-[var(--ads-ink)] hover:bg-[var(--ads-subtle)] disabled:text-[var(--ads-ink-muted)]",
  ghost:
    "border-transparent bg-transparent text-[var(--ads-ink-soft)] hover:bg-[#eef0f3] hover:text-[var(--ads-ink)] disabled:text-[var(--ads-ink-muted)]",
  danger:
    "border-transparent bg-[var(--ads-negative)] text-white hover:bg-[#912018] disabled:bg-[#e6a29c]",
};

export function buttonClasses(variant: ButtonVariant = "secondary", size: "sm" | "md" = "md"): string {
  const sizing = size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-[14px]";
  return `inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:cursor-not-allowed ${sizing} ${BUTTON_VARIANTS[variant]}`;
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
    <Tag className={`rounded-lg border border-[var(--ads-line)] bg-white ${className}`} {...rest}>
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
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--ads-line)] px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 id={titleId} className="text-[15px] font-semibold text-[var(--ads-ink)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-[13px] text-[var(--ads-ink-muted)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

type NoticeTone = "info" | "warning" | "error" | "success";

const NOTICE_STYLES: Record<NoticeTone, { box: string; icon: typeof Info }> = {
  info: { box: "border-[#d1e0ff] bg-[#f5f8ff] text-[#1e3a8a]", icon: Info },
  warning: { box: "border-[#fedf89] bg-[#fffcf5] text-[#93370d]", icon: AlertCircle },
  error: { box: "border-[#fecdca] bg-[#fffbfa] text-[#912018]", icon: AlertCircle },
  success: { box: "border-[#abefc6] bg-[#f6fef9] text-[#085d3a]", icon: CheckCircle2 },
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
      className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13.5px] leading-relaxed ${style.box} ${className}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label ? <span>{label}</span> : null}
    </span>
  );
}

/**
 * Modal nativo (`<dialog>` + `showModal`): o navegador cuida da camada, do foco
 * preso dentro dele e de deixar o resto da página inerte. Monte o componente só
 * quando ele deve aparecer; ao desmontar, o foco volta para onde estava.
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
  /** Falso enquanto algo está sendo salvo: Esc e o X ficam bloqueados. */
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

  const width = size === "lg" ? "w-[min(720px,calc(100vw-1.5rem))]" : "w-[min(520px,calc(100vw-1.5rem))]";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={`m-auto max-h-[calc(100dvh-1.5rem)] ${width} overflow-hidden rounded-lg border border-[var(--ads-line)] bg-white p-0 text-[var(--ads-ink)] shadow-[0_20px_50px_-20px_rgba(16,24,40,0.35)]`}
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--ads-line)] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[16px] font-semibold">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-0.5 text-[13.5px] text-[var(--ads-ink-muted)]">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissable}
            className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-md text-[var(--ads-ink-muted)] transition-colors hover:bg-[#eef0f3] hover:text-[var(--ads-ink)] disabled:opacity-40"
            aria-label="Fechar"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--ads-line)] bg-[var(--ads-subtle)] px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
