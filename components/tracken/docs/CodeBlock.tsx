"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Bloco de codigo com botao de copiar.
 *
 * Documentacao de API sem copiar e documentacao que o dev vai transcrever a
 * mao, errando um caractere no meio. O botao existe por isso.
 *
 * O fundo e escuro mesmo no tema claro do painel: bloco de codigo precisa se
 * separar do texto sem depender de borda, e monoespacado sobre fundo claro em
 * pagina longa cansa mais.
 */
export default function CodeBlock({
  code,
  language,
  label,
}: {
  code: string;
  /** Rotulo curto exibido no canto, ex: "JSON", "bash", "Node.js". */
  language?: string;
  /** Titulo da caixa, ex: "Requisicao". */
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      // Volta ao estado normal sozinho: confirmacao permanente vira ruido.
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Navegador sem permissao de clipboard: o texto segue selecionavel.
    }
  };

  return (
    <figure className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-[#11161f]">
      <figcaption className="flex items-center justify-between gap-3 border-b border-slate-800 bg-[#0c1017] px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2">
          {label && (
            <span className="truncate text-[14px] font-semibold text-slate-200">
              {label}
            </span>
          )}
          {language && (
            <span className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              {language}
            </span>
          )}
        </span>

        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[13px] font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          aria-label={copied ? "Copiado" : "Copiar código"}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-green-400" aria-hidden="true" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copiar
            </>
          )}
        </button>
      </figcaption>

      <pre className="overflow-x-auto px-4 py-4 text-[14.5px] leading-relaxed text-slate-100">
        <code className="font-mono">{code}</code>
      </pre>
    </figure>
  );
}
