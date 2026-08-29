/**
 * Modalidade logistica do envio no Mercado Livre.
 *
 * A equipe precisa conferir se o envio e realmente FLEX antes de abrir chamado,
 * porque o tratamento do atraso muda conforme a modalidade. O valor cru vem da
 * Tracken (campo `logistic_type` do ML) e e guardado como veio; a traducao para
 * rotulo acontece aqui.
 *
 * Se o Mercado Livre criar uma modalidade nova, ela aparece com o codigo cru em
 * vez de virar erro ou sumir da tela.
 */

export type ShippingModeInfo = {
  code: string;
  label: string;
  /** Cor do badge no painel. */
  color: "green" | "blue" | "amber" | "purple" | "slate";
  isFlex: boolean;
};

/** `self_service` e o FLEX: o proprio vendedor entrega. */
export const FLEX_MODE = "self_service";

const KNOWN_MODES: Record<string, Omit<ShippingModeInfo, "code">> = {
  self_service: { label: "FLEX", color: "green", isFlex: true },
  cross_docking: { label: "Coletas", color: "blue", isFlex: false },
  fulfillment: { label: "Full", color: "purple", isFlex: false },
  drop_off: { label: "Agência", color: "amber", isFlex: false },
  xd_drop_off: { label: "Places", color: "amber", isFlex: false },
  default: { label: "Padrão", color: "slate", isFlex: false },
  not_specified: { label: "Não informado", color: "slate", isFlex: false },
};

/** Opcoes para o filtro de modalidade do painel. */
export const SHIPPING_MODE_OPTIONS: ShippingModeInfo[] = Object.entries(
  KNOWN_MODES
)
  .filter(([code]) => code !== "not_specified")
  .map(([code, info]) => ({ code, ...info }));

/** Traduz o codigo cru para rotulo e cor. Nunca lanca. */
export function describeShippingMode(
  code: string | null | undefined
): ShippingModeInfo | null {
  if (!code) {
    return null;
  }

  const normalized = code.trim().toLowerCase();
  const known = KNOWN_MODES[normalized];

  if (known) {
    return { code: normalized, ...known };
  }

  // Modalidade desconhecida: mostra o codigo como veio, sem inventar rotulo.
  return {
    code: normalized,
    label: code.trim(),
    color: "slate",
    isFlex: false,
  };
}

/** Normaliza o valor recebido da Tracken para persistir. */
export function normalizeShippingMode(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized.length === 0) {
    return null;
  }

  // Aceita tambem os apelidos que a operacao usa no dia a dia.
  const ALIASES: Record<string, string> = {
    flex: FLEX_MODE,
    me2_flex: FLEX_MODE,
    mercado_envios_flex: FLEX_MODE,
    coleta: "cross_docking",
    coletas: "cross_docking",
    full: "fulfillment",
    agencia: "drop_off",
    places: "xd_drop_off",
  };

  const resolved = ALIASES[normalized] ?? normalized;
  return resolved.slice(0, 40);
}
