/**
 * Regras de precificacao de servicos compartilhadas entre as telas de venda.
 *
 * Motivo de existir: a logica progressiva estava duplicada em
 * `app/dashboard/sales/new/page.tsx` e `app/dashboard/sales/page.tsx`, com
 * comparacoes de nome diferentes entre as duas (uma normalizava acento, a
 * outra nao). Isso fazia a MESMA venda ser calculada de formas diferentes
 * dependendo da tela usada. Centralizando aqui, as duas passam a usar
 * exatamente a mesma regra.
 */

/**
 * `saleType` e tipado como string para aceitar os diferentes tipos usados nas
 * telas ("01" | "02" em algumas, "01" | "02" | "03" em outras) sem exigir cast.
 */
export type PriceRangeLike = {
  saleType: string;
  minQuantity: number;
  maxQuantity: number | null;
  unitPrice: number;
};

/** Remove acentos e normaliza caixa para comparar nomes de servico. */
export function normalizeServiceName(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Servicos com precificacao progressiva (estilo faixa de imposto de renda):
 * as primeiras N unidades custam o preco da 1a faixa e o excedente custa o
 * preco da faixa seguinte, somando os dois.
 *
 * "Cancelados" foi criado para ter precificacao identica a "Reclamacao",
 * portanto entra na mesma regra.
 */
export function isProgressiveService(serviceName: string | null | undefined): boolean {
  const normalized = normalizeServiceName(serviceName);
  return (
    normalized.includes("reclamac") || normalized.includes("cancelado")
  );
}

/** Ordena e filtra as faixas aplicaveis ao tipo de venda, com fallback para '01'. */
export function getApplicableRanges(
  ranges: PriceRangeLike[],
  saleType: string,
): PriceRangeLike[] {
  const sorted = ranges
    .filter((range) => range.saleType === saleType)
    .sort((a, b) => a.minQuantity - b.minQuantity);

  if (sorted.length > 0) {
    return sorted;
  }

  return ranges
    .filter((range) => range.saleType === "01")
    .sort((a, b) => a.minQuantity - b.minQuantity);
}

/**
 * Calcula o subtotal de um item de venda.
 *
 * - Servicos progressivos (Reclamacao/Cancelados): primeiras 10 unidades no
 *   preco da 1a faixa; da 11a em diante, no preco da 2a faixa.
 * - Demais servicos (ex.: Atrasos): faixa simples, quantidade x preco da faixa.
 */
export function calculateServiceSubtotal(
  quantity: number,
  serviceName: string | null | undefined,
  ranges: PriceRangeLike[],
  saleType: string,
): number {
  const qty = Number(quantity) || 0;
  if (qty <= 0) {
    return 0;
  }

  const applicableRanges = getApplicableRanges(ranges, saleType);
  if (applicableRanges.length === 0) {
    return 0;
  }

  if (isProgressiveService(serviceName)) {
    // A 1a faixa e a primeira cadastrada (a lista esta ordenada por
    // minQuantity). A 2a e a proxima faixa acima dela.
    const firstRange = applicableRanges[0];
    const secondRange = applicableRanges.find(
      (r) => r.minQuantity > firstRange.minQuantity,
    );

    // IMPORTANTE: nao inventar precos. Se o cadastro nao tiver a 2a faixa,
    // o excedente e cobrado pelo preco da 1a (comportamento linear), em vez
    // de aplicar um valor fixo que nao existe no cadastro.
    // A versao anterior usava 40/15 como fallback, o que podia cobrar um
    // valor que o administrador nunca cadastrou.
    const firstRangePrice = firstRange.unitPrice;
    const secondRangePrice = secondRange?.unitPrice ?? firstRangePrice;

    // Limite da 1a faixa vem do cadastro. Se for aberta (max nulo), nao ha
    // excedente: tudo e cobrado pelo preco da 1a faixa.
    const threshold =
      firstRange.maxQuantity ??
      (secondRange ? secondRange.minQuantity - 1 : Number.POSITIVE_INFINITY);

    if (qty <= threshold) {
      return qty * firstRangePrice;
    }

    return threshold * firstRangePrice + (qty - threshold) * secondRangePrice;
  }

  const range = applicableRanges.find(
    (r) =>
      qty >= r.minQuantity &&
      (r.maxQuantity === null || qty <= r.maxQuantity),
  );

  return range ? qty * range.unitPrice : 0;
}

/** Rotulo de exibicao padronizado por servico (usado em dashboards/relatorios). */
export function formatServiceLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const normalized = normalizeServiceName(value);

  if (normalized.includes("reclamac")) return "Reclamações";
  if (normalized.includes("atraso")) return "Atrasos";
  if (normalized.includes("cancelado")) return "Cancelados";
  return value;
}
