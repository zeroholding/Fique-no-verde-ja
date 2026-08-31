-- =====================================================
-- Migracao 022: indice de busca por nome de cliente
--
-- Demanda: "AMBIENTE VENDAS | AJUSTE DO FILTRO EM BUSCA NO MODULO DE VENDA,
--           NUNCA FICA DE PRIMEIRA O RESULTADO AO FILTRAR ALGUM NOME"
--
-- A ordenacao por relevancia foi resolvida na aplicacao (ORDER BY em
-- app/api/sales/route.ts). Esta migracao cuida so do custo da busca.
--
-- CONTEXTO
--   A busca de vendas agora compara nomes normalizados:
--     fnvj_normalize_text(c.name) LIKE '%' || fnvj_normalize_text($1) || '%'
--
--   Dois problemas de desempenho nesse predicado:
--     1. O padrao comeca com curinga, entao indice btree nao serve.
--     2. A coluna esta dentro de uma chamada de funcao, entao nem o
--        idx_clients_name existente seria considerado.
--   Sem indice, cada busca faz varredura sequencial em clients.
--
-- SOLUCAO
--   pg_trgm (habilitada na migracao 020) + indice GIN sobre a EXPRESSAO
--   fnvj_normalize_text(name). O indice de expressao so e valido porque
--   fnvj_normalize_text foi declarada IMMUTABLE na migracao 018.
--
-- ESCOPO
--   Somente CREATE INDEX. Nenhuma linha de clients, sales ou qualquer outra
--   tabela do FNVJ e lida, alterada ou apagada.
--
-- Idempotente: pode ser executada mais de uma vez.
-- =====================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Busca por pedaco de nome, sem acento e sem caixa. Atende tanto a listagem
-- de vendas quanto o autocomplete de cliente.
CREATE INDEX IF NOT EXISTS idx_clients_name_norm_trgm
  ON clients USING gin (fnvj_normalize_text(name) gin_trgm_ops);

COMMENT ON INDEX idx_clients_name_norm_trgm IS
  'Busca por nome de cliente sem acento/caixa (ILIKE com curinga a esquerda) na listagem de vendas';

COMMIT;

-- =====================================================
-- Verificacao (executar apos a migracao)
-- =====================================================
-- SELECT indexname FROM pg_indexes
--  WHERE tablename = 'clients' AND indexname = 'idx_clients_name_norm_trgm';
-- Esperado: 1 linha.
--
-- EXPLAIN (COSTS OFF)
-- SELECT c.id FROM clients c
--  WHERE fnvj_normalize_text(c.name) LIKE '%' || fnvj_normalize_text('maria') || '%';
-- Esperado: Bitmap Index Scan on idx_clients_name_norm_trgm.
-- (Em tabela pequena o planejador pode preferir Seq Scan; nesse caso
--  confirme com SET enable_seqscan = off.)
