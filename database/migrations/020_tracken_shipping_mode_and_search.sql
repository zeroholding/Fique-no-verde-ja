-- =====================================================
-- Migracao 020: modalidade de envio, data real do envio e
--               indices de busca do painel Tracken
--
-- Motivacao operacional:
--  - A equipe precisa conferir se o envio e realmente FLEX antes de abrir
--    chamado, entao a modalidade passa a ser dado de primeira classe.
--  - Precisa tambem da data em que o envio de fato saiu, para comparar com o
--    limite de envio do Mercado Livre.
--  - A busca do painel usa ILIKE '%texto%', que nao aproveita indice btree.
--    Com trigramas a busca deixa de varrer a tabela inteira.
--
-- Idempotente: pode ser executada mais de uma vez.
-- Documentacao: APINOVA/PAINEL_FNVJ_TRACKEN.md
-- =====================================================

BEGIN;

-- -----------------------------------------------------
-- 1) Colunas novas em tracken_tickets
-- -----------------------------------------------------

-- Modalidade logistica do envio no Mercado Livre.
-- Guarda o valor cru que a Tracken enviar (logistic_type do ML). A traducao
-- para rotulo acontece na aplicacao, para um valor novo do ML nao virar erro
-- de banco: ele simplesmente aparece como veio.
ALTER TABLE tracken_tickets
  ADD COLUMN IF NOT EXISTS shipping_mode VARCHAR(40);

-- Data/hora em que o envio realmente foi despachado.
-- Diferente de shipping_deadline, que e o prazo limite.
ALTER TABLE tracken_tickets
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;

COMMENT ON COLUMN tracken_tickets.shipping_mode IS
  'Modalidade logistica do envio no ML (logistic_type). self_service = FLEX';
COMMENT ON COLUMN tracken_tickets.shipped_at IS
  'Data em que o envio foi de fato despachado; comparar com shipping_deadline';

CREATE INDEX IF NOT EXISTS idx_tracken_tickets_shipping_mode
  ON tracken_tickets(shipping_mode);
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_shipped_at
  ON tracken_tickets(shipped_at);

-- -----------------------------------------------------
-- 2) Indice composto para a consulta mais comum do painel
--    (filtra por status e ordena por limite de envio)
-- -----------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_status_deadline
  ON tracken_tickets(status, shipping_deadline);

-- Fila de trabalho: atendimentos em aberto por atendente.
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_assigned_deadline
  ON tracken_tickets(assigned_user_id, shipping_deadline);

-- SLA: so os finalizados entram na conta, entao o indice e parcial.
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_finished
  ON tracken_tickets(finished_at)
  WHERE finished_at IS NOT NULL;

-- -----------------------------------------------------
-- 3) Busca por trigramas
--
--    O painel busca com ILIKE '%texto%'. Um indice btree nao serve para
--    padrao que comeca com curinga, entao sem isso cada busca varre a tabela
--    inteira. Com pg_trgm e indice GIN a busca fica indexada.
-- -----------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_tracken_tickets_shipment_trgm
  ON tracken_tickets USING gin (shipment_id gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_order_trgm
  ON tracken_tickets USING gin (order_id gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_seller_trgm
  ON tracken_tickets USING gin (seller_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_buyer_name_trgm
  ON tracken_tickets USING gin (buyer_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_buyer_nick_trgm
  ON tracken_tickets USING gin (buyer_nickname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_tracking_trgm
  ON tracken_tickets USING gin (tracking_number gin_trgm_ops);

COMMIT;

-- =====================================================
-- Verificacao (executar apos a migracao)
-- =====================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'tracken_tickets'
--   AND column_name IN ('shipping_mode', 'shipped_at');
-- Esperado: 2 linhas.
--
-- SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'tracken_tickets';
-- Esperado: 18 indices.
--
-- SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';
-- Esperado: 1 linha.
