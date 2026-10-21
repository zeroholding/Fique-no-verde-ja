// lib/live/consulta.ts
//
// Leitura dos números de HOJE para o painel ao vivo (/live).
//
// As regras são as MESMAS do dashboard (app/api/dashboard/metrics/route.ts,
// visão do administrador, período "hoje"), para os dois mostrarem o mesmo
// número:
//  - fica de fora a venda cancelada (status 'cancelada') e o item de compra de
//    pacote (sale_type '02'). Venda comum ('01') e consumo de pacote ('03')
//    entram;
//  - receita líquida = soma dos subtotais dos itens - descontos - estornos.
//    Comissão não é descontada (o dashboard também não desconta);
//  - atendimentos = vendas distintas;
//  - remoções de atraso / de reclamação = soma das quantidades dos itens cujo
//    serviço (nome do serviço ou, sem ele, nome do produto, sem acento e em
//    minúsculas) contém "atras" / "reclam";
//  - o dia é o de Brasília, pelo relógio do banco. A hora do gráfico é a hora
//    da venda (sale_date) em Brasília.
//
// Este arquivo não fala com o banco: só monta a consulta e interpreta as
// linhas. Quem executa é lib/live/central.ts.

import type { DadosDoPainel, HoraDoPainel } from "./tipos";

/** Mesma normalização de serviço do dashboard: sem acento, minúsculas, sem espaço nas pontas. */
const servicoNormalizado = (expressao: string) => `
  LOWER(
    TRANSLATE(
      TRIM(${expressao}),
      '\u00C1\u00C0\u00C2\u00C3\u00C4\u00C5\u00E1\u00E0\u00E2\u00E3\u00E4\u00E5\u00C9\u00C8\u00CA\u00CB\u00E9\u00E8\u00EA\u00EB\u00CD\u00CC\u00CE\u00CF\u00ED\u00EC\u00EE\u00EF\u00D3\u00D2\u00D4\u00D5\u00D6\u00F3\u00F2\u00F4\u00F5\u00F6\u00DA\u00D9\u00DB\u00DC\u00FA\u00F9\u00FB\u00FC\u00C7\u00E7',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
    )
  )`;

/**
 * Uma linha por hora com atendimento e uma linha de total (GROUPING SETS).
 *
 * O filtro do dia usa intervalo em `sale_date` (e não `sale_date::date = hoje`)
 * para aproveitar o índice da coluna. O resultado é o mesmo: [00:00, 24:00) de
 * hoje em Brasília.
 *
 * Os descontos e estornos são somados por linha do JOIN com os itens, como no
 * dashboard (lá também). Toda venda gravada hoje tem um item só, então isso
 * não infla o valor; se um dia houver venda com dois itens, os dois números
 * continuam iguais entre si.
 */
export const SQL_DO_PAINEL = `
  -- painel ao vivo (/live)
  WITH limites AS (
    SELECT
      now() AS agora,
      date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AS inicio_local
  ),
  linhas AS (
    SELECT
      s.id AS venda_id,
      s.sale_date,
      EXTRACT(HOUR FROM s.sale_date AT TIME ZONE 'America/Sao_Paulo')::int AS hora,
      s.total_discount,
      s.refund_total,
      si.quantity,
      si.subtotal,
      ${servicoNormalizado("COALESCE(serv.name, si.product_name)")} AS servico
    FROM sales s
    CROSS JOIN limites l
    LEFT JOIN sale_items si ON si.sale_id = s.id
    LEFT JOIN services serv ON si.product_id = serv.id
    WHERE s.status != 'cancelada'
      AND (si.sale_type IS NULL OR si.sale_type != '02')
      AND s.sale_date >= (l.inicio_local AT TIME ZONE 'America/Sao_Paulo')
      AND s.sale_date < ((l.inicio_local + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')
  ),
  agregado AS (
    SELECT
      GROUPING(hora) = 1 AS total,
      hora,
      COUNT(DISTINCT venda_id)::int AS atendimentos,
      ROUND(
        (COALESCE(SUM(subtotal), 0) - COALESCE(SUM(total_discount), 0) - COALESCE(SUM(refund_total), 0)) * 100
      )::bigint AS liquida_centavos,
      ROUND(COALESCE(SUM(subtotal), 0) * 100)::bigint AS bruto_centavos,
      ROUND(COALESCE(SUM(total_discount), 0) * 100)::bigint AS descontos_centavos,
      ROUND(COALESCE(SUM(refund_total), 0) * 100)::bigint AS estornos_centavos,
      COALESCE(SUM(quantity) FILTER (WHERE servico LIKE '%atras%'), 0)::int AS atrasos,
      COALESCE(SUM(quantity) FILTER (WHERE servico LIKE '%reclam%'), 0)::int AS reclamacoes,
      MAX(sale_date) AS ultima_venda
    FROM linhas
    GROUP BY GROUPING SETS ((hora), ())
  )
  SELECT
    to_char(l.inicio_local, 'YYYY-MM-DD') AS dia,
    EXTRACT(HOUR FROM l.agora AT TIME ZONE 'America/Sao_Paulo')::int AS hora_atual,
    a.total,
    a.hora,
    a.atendimentos,
    a.liquida_centavos,
    a.bruto_centavos,
    a.descontos_centavos,
    a.estornos_centavos,
    a.atrasos,
    a.reclamacoes,
    a.ultima_venda
  FROM limites l
  LEFT JOIN agregado a ON true
  ORDER BY a.total, a.hora
`;

/** Linha como o driver `pg` entrega (bigint vem como texto). */
export type LinhaDoPainel = {
  dia: string;
  hora_atual: number | string;
  total: boolean | null;
  hora: number | string | null;
  atendimentos: number | string | null;
  liquida_centavos: number | string | null;
  bruto_centavos: number | string | null;
  descontos_centavos: number | string | null;
  estornos_centavos: number | string | null;
  atrasos: number | string | null;
  reclamacoes: number | string | null;
  ultima_venda: Date | string | null;
};

const inteiro = (valor: unknown): number => {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? Math.round(numero) : 0;
};

/** Converte as linhas da consulta nos números da tela. */
export function montarPainel(linhas: LinhaDoPainel[], geradoEm: number): DadosDoPainel {
  const base = linhas[0];
  if (!base) {
    throw new Error("A consulta do painel ao vivo não devolveu nenhuma linha.");
  }

  const total = linhas.find((linha) => linha.total === true);
  const porHora: HoraDoPainel[] = linhas
    .filter((linha) => linha.total === false && linha.hora !== null)
    .map((linha) => ({
      hora: inteiro(linha.hora),
      atendimentos: inteiro(linha.atendimentos),
      atrasos: inteiro(linha.atrasos),
      reclamacoes: inteiro(linha.reclamacoes),
    }))
    .sort((a, b) => a.hora - b.hora);

  const ultima = total?.ultima_venda ? new Date(total.ultima_venda) : null;

  return {
    dia: String(base.dia),
    horaAtual: inteiro(base.hora_atual),
    geradoEm,
    receitaLiquidaCentavos: inteiro(total?.liquida_centavos),
    receitaBrutaCentavos: inteiro(total?.bruto_centavos),
    descontosCentavos: inteiro(total?.descontos_centavos),
    estornosCentavos: inteiro(total?.estornos_centavos),
    atendimentos: inteiro(total?.atendimentos),
    atrasos: inteiro(total?.atrasos),
    reclamacoes: inteiro(total?.reclamacoes),
    porHora,
    ultimoAtendimentoEm: ultima && !Number.isNaN(ultima.getTime()) ? ultima.toISOString() : null,
  };
}

/**
 * Identidade dos números, sem o horário da leitura: duas leituras com a mesma
 * chave não precisam ir para a tela de novo.
 */
export function chaveDoPainel(dados: DadosDoPainel): string {
  return JSON.stringify([
    dados.dia,
    dados.horaAtual,
    dados.receitaLiquidaCentavos,
    dados.receitaBrutaCentavos,
    dados.descontosCentavos,
    dados.estornosCentavos,
    dados.atendimentos,
    dados.atrasos,
    dados.reclamacoes,
    dados.porHora,
    dados.ultimoAtendimentoEm,
  ]);
}
