"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Identificador com copia.
 *
 * O atendente usa o ID de envio e o numero da venda direto no painel do
 * Mercado Livre, entao copiar sem selecionar com o mouse economiza muito tempo
 * ao longo do dia.
 *
 * O botao so aparece ao passar o mouse na linha, para a grade nao ficar
 * poluida de icones. Segue alcancavel por teclado.
 */
export default function CopyableId({
  value,
  label,
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Navegador sem permissao de clipboard: o numero segue selecionavel.
      setCopied(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <span className="tk-num font-mono text-[12.5px] text-slate-800">
        {value}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className={`rounded p-1 transition-all ${
          copied
            ? "text-green-600 opacity-100"
            : "text-slate-400 opacity-0 hover:bg-slate-100 hover:text-slate-700 focus-visible:opacity-100 group-hover:opacity-100"
        }`}
        aria-label={copied ? "Copiado" : `Copiar ${label ?? "valor"} ${value}`}
        title={copied ? "Copiado" : "Copiar"}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
