-- =====================================================
-- Migracao 028: registro do e-mail diario de saldo dos pacotes
--
-- Uma linha por dia (horario de Brasilia). E o que impede o
-- e-mail das 9h de sair duas vezes num reinicio ou com duas
-- replicas, e o que guarda o motivo quando o envio falha.
--
--   status: sending | sent | failed
--   attempts: tentativas do dia (limite 6, 10 min entre elas)
--   idempotency_key: chave enviada ao Brevo; trocada so quando
--                    o Brevo recusou (nada foi entregue)
--
-- Mesmo SQL de lib/saldo-pacotes/envio.ts: o envio tambem cria
-- a tabela na primeira vez. Idempotente.
-- =====================================================

CREATE TABLE IF NOT EXISTS package_balance_email_runs (
  run_date DATE PRIMARY KEY,
  status VARCHAR(20) NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(80),
  recipients TEXT,
  message_id TEXT,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
