/**
 * Motivos de negativa de um atendimento.
 *
 * Sao exatamente tres, definidos pela operacao. Ficam aqui, num unico lugar,
 * porque a mesma lista precisa valer no banco (CHECK da migracao 023), na API
 * (validacao do PATCH) e nas duas telas que negam (menu da linha e modal de
 * detalhe). Lista repetida em quatro lugares divergiria na primeira mudanca.
 *
 * O banco guarda o CODIGO, nao o texto. Reescrever o texto de um motivo passa a
 * ser mudanca de uma linha aqui, sem precisar atualizar registro historico --
 * que e exatamente o problema que casar por texto criaria.
 */

export const DENIAL_REASONS = [
  {
    code: "venda_analisada",
    label: "Venda já analisada anteriormente",
  },
  {
    code: "excesso_contato",
    label: "Excesso de contato",
  },
  {
    code: "bipagem_distante",
    label: "Bipagem muito longe do local de entrega",
  },
] as const;

export type DenialReasonCode = (typeof DENIAL_REASONS)[number]["code"];

/** Status que exige motivo. Fica nomeado para nao espalhar a string "negado". */
export const STATUS_REQUIRING_DENIAL_REASON = "negado";

const CODES: string[] = DENIAL_REASONS.map((reason) => reason.code);

export function isDenialReasonCode(
  value: string | null | undefined
): value is DenialReasonCode {
  return typeof value === "string" && CODES.includes(value);
}

/** Texto do motivo para exibicao. Codigo desconhecido volta como esta. */
export function denialReasonLabel(
  code: string | null | undefined
): string | null {
  if (!code) return null;
  return DENIAL_REASONS.find((reason) => reason.code === code)?.label ?? code;
}
