/**
 * Saldo dos pacotes por cliente parceiro (as transportadoras Flex).
 *
 * É a MESMA conta da tela "Contas de Pacotes" (/dashboard/packages), que lê o
 * saldo vivo de `client_packages` em `app/api/packages/statement/route.ts`:
 *
 *   quantidade  = Σ available_quantity            das carteiras do cliente
 *   financeiro  = Σ available_quantity × unit_price
 *   média / un  = |financeiro ÷ quantidade|        ("-" quando a quantidade é 0)
 *   média global = financeiro total ÷ quantidade total, só se a total for > 0
 *
 * Sem filtro de carteira inativa nem de validade, como a tela. Se o e-mail
 * contasse diferente, o número das 9h não bateria com o da tela e ninguém
 * confiaria em nenhum dos dois. Saldo negativo é permitido no sistema (o
 * consumo não trava sem saldo) e aparece como está.
 */

import { pool } from "@/lib/db";

/** Executa uma consulta. O pool por padrão; o teste passa outro banco. */
export type Executor = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

export const executarNoPool: Executor = async (sql, params) => {
  // `pool.query` e não `query()` de lib/db.ts: aquele guarda a transação numa
  // variável global, e uma leitura agendada cairia na transação de outra rota.
  const resultado = await pool.query(sql, params as unknown[]);
  return { rows: resultado.rows as Record<string, unknown>[] };
};

export const SQL_SALDO_PACOTES = `
  SELECT c.id AS cliente_id,
         c.name AS cliente_nome,
         c.statement_slug AS slug,
         COUNT(cp.id) AS carteiras,
         COALESCE(SUM(cp.available_quantity), 0) AS saldo_qtde,
         COALESCE(SUM(cp.available_quantity * cp.unit_price), 0) AS saldo_financeiro
    FROM client_packages cp
    JOIN clients c ON c.id = cp.client_id
   GROUP BY c.id, c.name, c.statement_slug
`;

export type SaldoCliente = {
  clienteId: string;
  nome: string;
  slug: string | null;
  carteiras: number;
  saldoQtde: number;
  saldoFinanceiro: number;
  /** Valor médio por crédito, como na tela. `null` quando o saldo é 0. */
  valorMedio: number | null;
};

export type ResumoSaldos = {
  clientes: SaldoCliente[];
  totalQtde: number;
  totalFinanceiro: number;
  /** `null` quando o saldo total não é positivo (a tela mostra "-"). */
  mediaGlobal: number | null;
  negativos: number;
  zerados: number;
};

const numero = (valor: unknown): number => {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
};

/** Agrega as linhas da consulta. Pura, para o teste. */
export function resumirSaldos(linhas: Record<string, unknown>[]): ResumoSaldos {
  const clientes: SaldoCliente[] = linhas.map((linha) => {
    const saldoQtde = numero(linha.saldo_qtde);
    // Centavos: o Postgres devolve numeric como texto exato, e o arredondamento
    // fica num lugar só.
    const saldoFinanceiro = Math.round(numero(linha.saldo_financeiro) * 100) / 100;
    return {
      clienteId: String(linha.cliente_id),
      nome: String(linha.cliente_nome ?? "").trim() || "Sem nome",
      slug: typeof linha.slug === "string" && linha.slug.trim() ? linha.slug.trim() : null,
      carteiras: numero(linha.carteiras),
      saldoQtde,
      saldoFinanceiro,
      valorMedio: saldoQtde !== 0 ? Math.abs(saldoFinanceiro / saldoQtde) : null,
    };
  });

  clientes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

  const totalQtde = clientes.reduce((soma, cliente) => soma + cliente.saldoQtde, 0);
  const totalCentavos = clientes.reduce((soma, cliente) => soma + Math.round(cliente.saldoFinanceiro * 100), 0);
  const totalFinanceiro = totalCentavos / 100;

  return {
    clientes,
    totalQtde,
    totalFinanceiro,
    mediaGlobal: totalQtde > 0 ? totalFinanceiro / totalQtde : null,
    negativos: clientes.filter((cliente) => cliente.saldoQtde < 0).length,
    zerados: clientes.filter((cliente) => cliente.saldoQtde === 0).length,
  };
}

export async function carregarSaldos(executar: Executor = executarNoPool): Promise<ResumoSaldos> {
  const { rows } = await executar(SQL_SALDO_PACOTES);
  return resumirSaldos(rows);
}
