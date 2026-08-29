"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Lock } from "lucide-react";
import { StatusBadge } from "./Badges";
import type { PanelStatus } from "./panel-types";

/**
 * Troca de status direto na linha da tabela.
 *
 * O proprio badge de status vira o gatilho: um clique abre as transicoes
 * permitidas, outro aplica. E o caminho mais curto para a acao mais repetida do
 * dia, sem abrir tela nenhuma.
 *
 * O menu vai para um portal no `body` porque a tabela tem `overflow-x-auto`:
 * dentro dela, um menu absoluto seria cortado pela borda do container.
 */

type Props = {
  ticketId: string;
  statusLabel: string;
  statusColor: string | null;
  allowedNext: string[];
  statuses: PanelStatus[];
  /** Aplicar a transicao. Deve lancar em caso de falha. */
  onApply: (ticketId: string, nextStatus: string) => Promise<void>;
};

export default function RowStatusMenu({
  ticketId,
  statusLabel,
  statusColor,
  allowedNext,
  statuses,
  onApply,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isApplying, setIsApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const options = allowedNext
    .map((code) => statuses.find((status) => status.code === code))
    .filter((status): status is PanelStatus => Boolean(status));

  const hasOptions = options.length > 0;

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const MENU_WIDTH = 208;
    const estimatedHeight = 52 + options.length * 40;

    // Abre para cima quando nao ha espaco embaixo, e nunca deixa o menu sair
    // pela direita da janela.
    const openUpward =
      rect.bottom + estimatedHeight > window.innerHeight && rect.top > estimatedHeight;

    setPosition({
      top: openUpward ? rect.top - estimatedHeight - 4 : rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - MENU_WIDTH - 12),
    });
  }, [options.length]);

  useLayoutEffect(() => {
    if (isOpen) place();
  }, [isOpen, place]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (event: MouseEvent) => {
      if (
        !menuRef.current?.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    // Reposiciona ao rolar a tabela ou a pagina, senao o menu "descola".
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [isOpen, place]);

  const apply = async (nextStatus: string) => {
    setIsApplying(nextStatus);
    setError(null);

    try {
      await onApply(ticketId, nextStatus);
      setIsOpen(false);
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "Falha ao alterar o status"
      );
    } finally {
      setIsApplying(null);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => hasOptions && setIsOpen((previous) => !previous)}
        disabled={!hasOptions}
        aria-haspopup={hasOptions ? "menu" : undefined}
        aria-expanded={hasOptions ? isOpen : undefined}
        title={
          hasOptions
            ? `Alterar status (atual: ${statusLabel})`
            : `${statusLabel} — sem transição disponível`
        }
        className={`group inline-flex items-center gap-1 rounded-lg p-0.5 transition-colors ${
          hasOptions
            ? "cursor-pointer hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            : "cursor-default"
        }`}
      >
        <StatusBadge label={statusLabel} color={statusColor} />
        {hasOptions ? (
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:text-slate-600 ${
              isOpen ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        ) : (
          <Lock className="h-3 w-3 shrink-0 text-slate-300" aria-hidden="true" />
        )}
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Alterar status do atendimento (atual: ${statusLabel})`}
            style={{ top: position.top, left: position.left, width: 208 }}
            className="fixed z-[60] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <p className="border-b border-slate-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Mudar para
            </p>

            <ul className="py-1">
              {options.map((option) => (
                <li key={option.code}>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={isApplying !== null}
                    onClick={() => apply(option.code)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2">
                      <StatusBadge label={option.label} color={option.color} />
                    </span>
                    {isApplying === option.code ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin text-green-600"
                        aria-hidden="true"
                      />
                    ) : (
                      <Check
                        className="h-3.5 w-3.5 text-slate-300"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>

            {error && (
              <p
                role="alert"
                className="border-t border-red-100 bg-red-50 px-3 py-2 text-[11px] leading-snug text-red-700"
              >
                {error}
              </p>
            )}

            <p className="border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-500">
              Status atual: {statusLabel}
            </p>
          </div>,
          document.body
        )}
    </>
  );
}
