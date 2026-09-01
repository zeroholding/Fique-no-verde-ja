"use client";

import { DOT_CLASSES, normalizeColor } from "./tokens";

/**
 * Indicadores de estado.
 *
 * Sao discretos de proposito. Cor forte em cada celula transforma a tabela em
 * arco-iris e nada mais se destaca: o olho precisa achar o que esta FORA do
 * normal, nao ser puxado por tudo ao mesmo tempo. Entao o status usa um ponto
 * colorido com texto neutro, e a cor cheia fica reservada para alerta de prazo.
 */

type BadgeProps = {
  label: string;
  color?: string | null;
  title?: string;
};

/** Status do atendimento: ponto colorido, texto neutro. */
export function StatusBadge({ label, color, title }: BadgeProps) {
  const tone = normalizeColor(color);

  return (
    <span
      title={title ?? label}
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-[14px] font-medium text-slate-700"
    >
      <span
        className={`h-[7px] w-[7px] shrink-0 rounded-full ring-2 ring-inset ring-white/60 ${DOT_CLASSES[tone]}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

/*
 * A trilha vertical da transportadora usa o mesmo preenchimento cheio do resto
 * do painel (DOT_CLASSES em tokens.ts). Era um mapa identico copiado aqui.
 */

/**
 * Transportadora: sigla em caixa alta com uma trilha de cor a esquerda.
 * Le-se pela sigla, e a cor serve so para agrupar visualmente as linhas.
 */
export function CarrierBadge({ label, color, title }: BadgeProps) {
  const tone = normalizeColor(color);

  return (
    <span
      title={title ?? label}
      className="inline-flex items-center gap-2 whitespace-nowrap"
    >
      <span
        className={`h-3.5 w-[3px] shrink-0 rounded-full ${DOT_CLASSES[tone]}`}
        aria-hidden="true"
      />
      <span className="text-[14px] font-semibold tracking-wide text-slate-800">
        {label}
      </span>
    </span>
  );
}
