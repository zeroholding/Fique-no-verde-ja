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
    const firstRange = applicableRanges.find(
      (r) => r.minQuantity === 1 || r.minQuantity <= 10,
    );
    const secondRange = applicableRanges.find((r) => r.minQuantity >= 11);

    // O limite da 1a faixa vem do cadastro; 10 e apenas o fallback historico.
    const threshold = firstRange?.maxQuantity ?? 10;
    const firstRangePrice = firstRange?.unitPrice ?? 40;
    const secondRangePrice = secondRange?.unitPrice ?? 15;

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
