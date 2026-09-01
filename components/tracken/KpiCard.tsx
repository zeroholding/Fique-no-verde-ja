"use client";

import type { LucideIcon } from "lucide-react";
import { formatNumber } from "@/lib/tracken/format";
import { DOT_CLASSES, TINT_CLASSES, normalizeColor } from "./tokens";

/**
 * Cartao de indicador.
 *
 * A hierarquia e deliberada: o numero e o que se le de longe, o rotulo e
 * pequeno e o icone e discreto. Quando rotulo, numero e icone tem peso
 * parecido, nada se destaca e o cartao vira decoracao.
 *
 * Clicavel: aplica o filtro correspondente na grade.
 */

/*
 * A trilha de cor e o tom do icone vem de tokens.ts. Antes eram dois mapas
 * copiados aqui; o de trilha usava `bg-slate-300` contra `bg-slate-400` do
 * token, diferenca invisivel numa faixa de 2px e que so servia para as duas
 * definicoes seguirem convivendo.
 */

type Props = {
  title: string;
  value: number;
  hint: string;
  color?: string | null;
  icon: LucideIcon;
  isActive?: boolean;
  onClick?: () => void;
};

export default function KpiCard({
  title,
  value,
  hint,
  color,
  icon: Icon,
  isActive = false,
  onClick,
}: Props) {
  const tone = normalizeColor(color);

  const content = (
    <>
      <span
        className={`absolute inset-x-0 top-0 h-[3px] ${DOT_CLASSES[tone]} ${
          isActive ? "opacity-100" : "opacity-0 transition-opacity"
        } group-hover:opacity-70`}
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-2">
        <span className="tk-eyebrow">{title}</span>
        <Icon
          className={`h-4 w-4 shrink-0 ${TINT_CLASSES[tone]}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>

      <p className="tk-num mt-2.5 text-[32px] font-semibold leading-none text-slate-900">
        {formatNumber(value)}
      </p>
      <p className="mt-1.5 text-[13px] text-slate-500">{hint}</p>
    </>
  );

  const base = `group relative overflow-hidden rounded-[10px] border bg-white px-4 pb-3.5 pt-4 text-left transition-all ${
    isActive
      ? "border-[var(--tk-brand)] shadow-[0_0_0_3px_var(--tk-brand-wash)]"
      : "border-[var(--tk-line)] hover:border-[var(--tk-line-strong)]"
  }`;

  if (!onClick) {
    return <div className={base}>{content}</div>;
  }

  return (
    <button type="button" onClick={onClick} aria-pressed={isActive} className={base}>
      {content}
    </button>
  );
}
