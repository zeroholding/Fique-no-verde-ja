"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Botao de copiar ao lado de um valor escrito na linha.
 *
 * Diferente do CodeBlock, que copia um exemplo inteiro: aqui o alvo e um valor
 * unico que o dev vai colar em configuracao -- URL base, rota, codigo de
 * status. Sao justamente os valores que se transcreve errado por um caractere.
 *
 * So o icone, sem texto: ao lado de um valor curto, a palavra "Copiar" fica
 * maior que o proprio valor e rouba a atencao dele.
 *
 * A confirmacao aparece como etiqueta flutuante e sai sozinha. Confirmacao que
 * fica na tela vira ruido, e trocar o icone sem mais nada passa batido.
 */
export default function CopyInline({
  value,
  description,
  tone = "light",
}: {
  value: string;
  /** O que esta sendo copiado, para leitor de tela. Ex: "URL base". */
  description: string;
  /** `dark` para uso sobre o fundo verde do topo. */
  tone?: "light" | "dark";
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Sem permissao de clipboard o valor segue selecionavel na tela.
    }
  };

  const button =
    tone === "dark"
      ? "text-white/60 hover:bg-white/15 hover:text-white"
      : "text-slate-400 hover:bg-slate-200/70 hover:text-slate-700";

  return (
    <span className="relative inline-flex shrink-0 align-middle">
      <button
        type="button"
        onClick={copy}
        className={`rounded-md p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tk-brand)] ${button}`}
        aria-label={`Copiar ${description}`}
        title={`Copiar ${description}`}
      >
        {copied ? (
          <Check
            className="h-4 w-4 text-green-500"
            strokeWidth={2.2}
            aria-hidden="true"
          />
        ) : (
          <Copy className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
        )}
      </button>

      {/* `aria-live` para quem usa leitor de tela ouvir a confirmacao. */}
      <span
        aria-live="polite"
        className={`pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[12.5px] font-semibold text-white shadow-lg transition-opacity duration-150 ${
          copied ? "opacity-100" : "opacity-0"
        }`}
      >
        {copied ? "Copiado" : ""}
      </span>
    </span>
  );
}
