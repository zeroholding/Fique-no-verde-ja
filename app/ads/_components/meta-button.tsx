"use client";

import { RefreshCw } from "lucide-react";

/**
 * Botão de sincronização com a Meta.
 *
 * Existe separado porque a marca tem peso próprio: o laço infinito em azul é o
 * único lugar da tela onde a cor não é a do sistema. Ícone e texto seguem a
 * regra do módulo (SVG, nunca emoji) e o rótulo muda durante a chamada para a
 * pessoa saber que o clique pegou.
 */

/** Laço infinito da Meta, em SVG. `currentColor` para herdar o branco do botão. */
export function MetaMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M6.63 7.9c-2.1 0-3.73 1.83-3.73 4.1 0 2.27 1.63 4.1 3.73 4.1 2.86 0 4.44-4.1 6.12-4.1 1.68 0 3.26 4.1 6.12 4.1 2.1 0 3.73-1.83 3.73-4.1 0-2.27-1.63-4.1-3.73-4.1-2.86 0-4.44 4.1-6.12 4.1-1.68 0-3.26-4.1-6.12-4.1Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MetaSyncButton({
  onClick,
  syncing,
  disabled,
  label = "Sincronizar Meta Ads",
  className = "",
}: {
  onClick: () => void;
  syncing: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || syncing}
      title="Buscar os números mais recentes direto da Meta"
      className={`group relative inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-xl border border-[#0866FF]/30 bg-[linear-gradient(135deg,#0866FF_0%,#1B74FF_45%,#00B2FF_100%)] px-4 text-[13.5px] font-bold tracking-tight text-white shadow-[0_6px_18px_-6px_rgba(8,102,255,0.65)] transition-all duration-150 hover:brightness-[1.07] hover:shadow-[0_10px_24px_-8px_rgba(8,102,255,0.75)] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:shadow-none ${className}`}
    >
      {/* brilho superior, só decoração */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-white/15 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      />
      {syncing ? (
        <RefreshCw className="size-4 animate-spin" aria-hidden />
      ) : (
        <MetaMark className="size-4.5" />
      )}
      <span className="relative">{syncing ? "Sincronizando…" : label}</span>
    </button>
  );
}

/** Selo pequeno de "conectado", para o cabeçalho e para o estado vazio. */
export function MetaConnectedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-[#0866FF]/25 bg-[#0866FF]/8 px-2.5 py-1 text-[11.5px] font-bold text-[#0866FF] ${className}`}
    >
      <MetaMark className="size-3.5" />
      Meta Ads
    </span>
  );
}
