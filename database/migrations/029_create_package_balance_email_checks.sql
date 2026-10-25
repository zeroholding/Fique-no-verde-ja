-- =====================================================
-- Migracao 029: envios avulsos do e-mail de saldo dos pacotes
--
-- Uma linha por envio que deve sair uma vez so, como a
-- conferencia pos-deploy (CONFERENCIA_POS_DEPLOY em
-- lib/saldo-pacotes/envio.ts). Reinicio do servidor nao
-- repete o envio; para conferir de novo, troque a chave.
--
--   status: sending | sent | failed
--   attempts: tentativas (limite 3, 10 min entre elas)
--
-- Mesmo SQL de lib/saldo-pacotes/envio.ts: o envio tambem cria
-- a tabela na primeira vez. Idempotente.
-- =====================================================

CREATE TABLE IF NOT EXISTS package_balance_email_checks (
  check_key VARCHAR(80) PRIMARY KEY,
  status VARCHAR(20) NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  recipients TEXT,
  message_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
