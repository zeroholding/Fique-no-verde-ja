"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, ChevronDown, Loader2, Lock } from "lucide-react";
import { StatusBadge } from "./Badges";
import {
  DENIAL_REASONS,
  STATUS_REQUIRING_DENIAL_REASON,
} from "@/lib/tracken/denial";
import type { PanelStatus } from "./panel-types";

/**
 * Troca de status direto na linha da tabela.
 *
 * O proprio badge de status vira o gatilho: um clique abre as transicoes
 * permitidas, outro aplica. E o caminho mais curto para a acao mais repetida do
 * dia, sem abrir tela nenhuma.
 *
 * NEGAR e a excecao: exige motivo, entao o menu vira um segundo passo com os
 * tres motivos possiveis. Continua sendo dois cliques, sem abrir modal -- se
 * negar exigisse abrir a ficha, o atendente pararia de registrar o motivo e
 * escolheria outro status para se livrar do formulario.
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
  onApply: (
    ticketId: string,
    nextStatus: string,
    denialReason?: string | null
  ) => Promise<void>;
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
  /** Status escolhido que ainda depende de motivo (hoje, so "negado"). */
  const [pendingDenial, setPendingDenial] = useState<PanelStatus | null>(null);

  const options = allowedNext
    .map((code) => statuses.find((status) => status.code === code))
    .filter((status): status is PanelStatus => Boolean(status));

  const hasOptions = options.length > 0;
  const isReasonStep = pendingDenial !== null;

  // O passo de motivo e mais largo e mais alto: os rotulos sao frases, nao
  // uma palavra. Sem isso o menu abriria com o tamanho do passo anterior e
  // ficaria fora da tela ou cortado.
  const menuWidth = isReasonStep ? 292 : 208;

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = isReasonStep ? 292 : 208;
    const estimatedHeight = isReasonStep
      ? 84 + DENIAL_REASONS.length * 46
      : 52 + options.length * 40;

    // Abre para cima quando nao ha espaco embaixo, e nunca deixa o menu sair
    // pela direita da janela.
    const openUpward =
      rect.bottom + estimatedHeight > window.innerHeight &&
      rect.top > estimatedHeight;

    setPosition({
      top: openUpward ? rect.top - estimatedHeight - 4 : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 12)),
    });
  }, [options.length, isReasonStep]);

  useLayoutEffect(() => {
    if (isOpen) place();
  }, [isOpen, place]);

  /** Fechar tambem descarta o passo de motivo, senao ele reabre no meio. */
  const close = useCallback(() => {
    setIsOpen(false);
    setPendingDenial(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (event: MouseEvent) => {
      if (
        !menuRef.current?.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        close();
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // No passo de motivo, Escape volta para a lista de status em vez de
      // fechar tudo: quem errou o clique nao perde o menu inteiro.
      if (isReasonStep) {
        setPendingDenial(null);
        setError(null);
        return;
      }
      close();
      triggerRef.current?.focus();
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
  }, [isOpen, place, close, isReasonStep]);

  const apply = async (nextStatus: string, denialReason?: string | null) => {
    setIsApplying(denialReason ?? nextStatus);
    setError(null);

    try {
      await onApply(ticketId, nextStatus, denialReason ?? null);
      close();
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

  const selectStatus = (option: PanelStatus) => {
    if (option.code === STATUS_REQUIRING_DENIAL_REASON) {
      setPendingDenial(option);
      setError(null);
      return;
    }
    void apply(option.code);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!hasOptions) return;
          if (isOpen) {
            close();
          } else {
            setIsOpen(true);
          }
        }}
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
            style={{ top: position.top, left: position.left, width: menuWidth }}
            className="fixed z-[60] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            {isReasonStep ? (
              /* ---------- Passo 2: motivo da negativa ---------- */
              <>
                <div className="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingDenial(null);
                      setError(null);
                    }}
                    disabled={isApplying !== null}
                    className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                    aria-label="Voltar para a lista de status"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
                    Motivo da negativa
                  </span>
                </div>

                <ul className="py-1">
                  {DENIAL_REASONS.map((reason) => (
                    <li key={reason.code}>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={isApplying !== null}
                        onClick={() =>
                          apply(STATUS_REQUIRING_DENIAL_REASON, reason.code)
                        }
                        className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-[13.5px] font-medium leading-snug text-slate-700 transition-colors hover:bg-red-50 hover:text-red-800 focus:bg-red-50 focus:outline-none disabled:opacity-50"
                      >
                        {reason.label}
                        {isApplying === reason.code && (
                          <Loader2
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-red-600"
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
                    className="border-t border-red-100 bg-red-50 px-3 py-2 text-[12.5px] leading-snug text-red-700"
                  >
                    {error}
                  </p>
                )}

                <p className="border-t border-slate-100 px-3 py-1.5 text-[11.5px] leading-snug text-slate-500">
                  O motivo fica registrado no atendimento e no histórico.
                </p>
              </>
            ) : (
              /* ---------- Passo 1: para qual status ---------- */
              <>
                <p className="border-b border-slate-100 px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
                  Mudar para
                </p>

                <ul className="py-1">
                  {options.map((option) => (
                    <li key={option.code}>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={isApplying !== null}
                        onClick={() => selectStatus(option)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13.5px] font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none disabled:opacity-50"
                      >
                        <span className="flex items-center gap-2">
                          <StatusBadge
                            label={option.label}
                            color={option.color}
                          />
                        </span>
                        {isApplying === option.code ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin text-green-600"
                            aria-hidden="true"
                          />
                        ) : option.code === STATUS_REQUIRING_DENIAL_REASON ? (
                          /* Seta, e nao check: este item abre outro passo. */
                          <ChevronDown
                            className="h-3.5 w-3.5 -rotate-90 text-slate-300"
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
                    className="border-t border-red-100 bg-red-50 px-3 py-2 text-[12.5px] leading-snug text-red-700"
                  >
                    {error}
                  </p>
                )}

                <p className="border-t border-slate-100 px-3 py-1.5 text-[11.5px] text-slate-500">
                  Status atual: {statusLabel}
                </p>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
