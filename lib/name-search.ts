/**
 * Busca e ordenacao por relevancia de nome, para listas que ja estao em
 * memoria (comboboxes de cliente, selects com filtro).
 *
 * Motivo de existir: os dropdowns de cliente do modulo de vendas recebiam a
 * lista de /api/admin/clients, que vem ordenada por `created_at DESC`, e
 * apenas aplicavam `includes()`. O efeito pratico e que o nome procurado
 * quase nunca aparecia em primeiro: a ordem era "cliente cadastrado mais
 * recentemente", entao digitar "MARIA" mostrava primeiro a MARIANA
 * cadastrada ontem e a MARIA exata ficava no fim da lista.
 *
 * A mesma escala de relevancia usada no SQL de /api/sales esta reproduzida
 * aqui, para o operador ver a mesma ordem nos dois lugares.
 */

/** Remove acento e caixa, espelhando `fnvj_normalize_text` do banco. */
export const normalizeName = (value: string): string =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * Faixa de relevancia de um nome para o termo buscado. Menor e melhor.
 * O criterio central: match de palavra inteira vence match no meio de
 * palavra. Quem digita "ANA" quer ANA antes de MARIANA.
 *
 * Retorna `null` quando nao ha match nenhum.
 */
export const nameMatchRank = (name: string, term: string): number | null => {
  const n = normalizeName(name);
  const t = normalizeName(term);

  if (!t) return 0;
  if (n === t) return 1;
  if (n.startsWith(`${t} `)) return 2;
  if (n.includes(` ${t} `)) return 3;
  if (n.endsWith(` ${t}`)) return 4;
  if (n.startsWith(t)) return 5;

  // Cada palavra digitada aparece em algum lugar do nome, em qualquer ordem.
  // Cobre "MARIA SILVA" encontrando "MARIA DA SILVA".
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => n.includes(token))) return 6;

  if (n.includes(t)) return 7;
  return null;
};

/**
 * Filtra pelo termo e ordena por relevancia. Empate na mesma faixa:
 * nome mais curto primeiro (match mais "puro"), depois alfabetico.
 *
 * Com termo vazio devolve a lista ordenada por nome, que para um combobox e
 * mais util do que a ordem de cadastro.
 */
export const filterAndRankByName = <T>(
  items: T[],
  term: string,
  getName: (item: T) => string
): T[] => {
  const t = term.trim();

  if (!t) {
    return [...items].sort((a, b) =>
      normalizeName(getName(a)).localeCompare(normalizeName(getName(b)), "pt-BR")
    );
  }

  return items
    .map((item) => ({ item, rank: nameMatchRank(getName(item), t) }))
    .filter((entry): entry is { item: T; rank: number } => entry.rank !== null)
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      const nameA = getName(a.item);
      const nameB = getName(b.item);
      if (nameA.length !== nameB.length) return nameA.length - nameB.length;
      return normalizeName(nameA).localeCompare(normalizeName(nameB), "pt-BR");
    })
    .map((entry) => entry.item);
};
