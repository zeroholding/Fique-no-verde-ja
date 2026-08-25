-- =====================================================
-- Migracao 019: integracao FNVJ x TRACKEN
--
-- Cria a estrutura do painel de atendimento que recebe as
-- solicitacoes de remocao de atraso enviadas pela Tracken.
--
-- REGRA CENTRAL DO PROJETO: nada aqui altera tabelas do FNVJ
-- atual. Todas as tabelas novas usam o prefixo "tracken_" e as
-- unicas referencias a estrutura existente sao chaves
-- estrangeiras de leitura para users(id).
--
-- Idempotente: pode ser executada mais de uma vez.
-- Documentacao: APINOVA/PAINEL_FNVJ_TRACKEN.md
-- =====================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------
-- 1) Transportadoras da Tracken (TM, J3, PEX, TRANSMOTO)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS tracken_carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT 'slate',
  tracken_ref VARCHAR(120),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracken_carriers_active
  ON tracken_carriers(is_active);

-- -----------------------------------------------------
-- 2) Mapa de status configuravel
--    Os status vivem em tabela para que ajustar o fluxo do
--    atendimento seja configuracao, e nao deploy.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS tracken_status_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL UNIQUE,
  label VARCHAR(80) NOT NULL,
  tracken_status VARCHAR(80),
  color VARCHAR(20) NOT NULL DEFAULT 'slate',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_initial BOOLEAN NOT NULL DEFAULT false,
  is_final BOOLEAN NOT NULL DEFAULT false,
  counts_as_sla BOOLEAN NOT NULL DEFAULT true,
  allowed_next TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracken_status_map_active
  ON tracken_status_map(is_active, sort_order);

-- -----------------------------------------------------
-- 3) Credenciais de maquina usadas pela Tracken
--    O secret nunca e gravado em texto puro, apenas o hash.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS tracken_api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  api_key VARCHAR(120) NOT NULL UNIQUE,
  secret_hash VARCHAR(255) NOT NULL,
  secret_encrypted TEXT,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['tickets:write', 'tickets:read']::TEXT[],
  environment VARCHAR(20) NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production', 'sandbox')),
  allowed_ips TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  require_signature BOOLEAN NOT NULL DEFAULT true,
  webhook_url TEXT,
  webhook_secret VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracken_api_credentials_active
  ON tracken_api_credentials(is_active);

-- -----------------------------------------------------
-- 4) Atendimento (tabela central)
--    shipment_id e a chave natural do envio no Mercado Livre e
--    serve de chave de idempotencia da entrada.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS tracken_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  shipment_id VARCHAR(80) NOT NULL UNIQUE,
  order_id VARCHAR(80) NOT NULL,
  carrier_id UUID REFERENCES tracken_carriers(id) ON DELETE RESTRICT,
  tracken_ref VARCHAR(120),

  buyer_nickname VARCHAR(200),
  buyer_name VARCHAR(200),

  seller_name VARCHAR(200) NOT NULL,
  seller_ml_id VARCHAR(80),

  sale_date TIMESTAMPTZ NOT NULL,
  shipping_deadline TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  status VARCHAR(40) NOT NULL DEFAULT 'recepcionado',
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  resolution_note TEXT,
  ml_claim_id VARCHAR(80),

  service_type VARCHAR(30) NOT NULL DEFAULT 'atraso'
    CHECK (service_type IN ('atraso', 'reclamacao', 'cancelado')),
  tracking_number VARCHAR(120),
  pack_id VARCHAR(80),
  delay_reason TEXT,
  requested_by VARCHAR(200),

  payload_raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  credential_id UUID REFERENCES tracken_api_credentials(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracken_tickets_status
  ON tracken_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_carrier
  ON tracken_tickets(carrier_id);
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_deadline
  ON tracken_tickets(shipping_deadline);
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_received
  ON tracken_tickets(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_assigned
  ON tracken_tickets(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_order
  ON tracken_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_service_type
  ON tracken_tickets(service_type);

-- -----------------------------------------------------
-- 5) Historico imutavel do atendimento
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS tracken_ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tracken_tickets(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL
    CHECK (event_type IN (
      'received', 'status_changed', 'assigned', 'unassigned',
      'note', 'webhook_sent', 'webhook_failed'
    )),
  from_status VARCHAR(40),
  to_status VARCHAR(40),
  actor_type VARCHAR(20) NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('tracken', 'user', 'system')),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracken_ticket_events_ticket
  ON tracken_ticket_events(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracken_ticket_events_created
  ON tracken_ticket_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracken_ticket_events_type
  ON tracken_ticket_events(event_type);

-- -----------------------------------------------------
-- 6) Fila de saida (outbox) das notificacoes para a Tracken
--    A tela do atendente nunca espera a Tracken responder.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS tracken_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tracken_tickets(id) ON DELETE CASCADE,
  event_type VARCHAR(60) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts > 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT,
  last_http_status INTEGER,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracken_outbox_pending
  ON tracken_outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_tracken_outbox_ticket
  ON tracken_outbox(ticket_id);

-- -----------------------------------------------------
-- 7) Auditoria de chamadas da integracao
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS tracken_request_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  endpoint TEXT NOT NULL,
  http_method VARCHAR(10),
  http_status INTEGER,
  credential_id UUID REFERENCES tracken_api_credentials(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES tracken_tickets(id) ON DELETE SET NULL,
  request_body JSONB,
  response_body JSONB,
  duration_ms INTEGER,
  error TEXT,
  ip_address VARCHAR(60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracken_request_log_created
  ON tracken_request_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracken_request_log_direction
  ON tracken_request_log(direction, created_at DESC);

-- -----------------------------------------------------
-- Chave estrangeira logica de status -> mapa de status
-- (validada por trigger porque o mapa e configuravel)
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION tracken_validate_ticket_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tracken_status_map
    WHERE code = NEW.status AND is_active = true
  ) THEN
    RAISE EXCEPTION
      'TRACKEN_INVALID_STATUS: status "%" nao existe em tracken_status_map',
      NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_tracken_validate_ticket_status
  ON tracken_tickets;
CREATE TRIGGER trigger_tracken_validate_ticket_status
  BEFORE INSERT OR UPDATE OF status ON tracken_tickets
  FOR EACH ROW
  EXECUTE FUNCTION tracken_validate_ticket_status();

-- O historico e trilha de auditoria: nenhuma linha pode ser reescrita.
--
-- O bloqueio cobre UPDATE, nao DELETE. Bloquear DELETE tambem impediria o
-- ON DELETE CASCADE de tracken_tickets, tornando impossivel remover um
-- atendimento gravado por engano ou atender pedido de exclusao de dados. A
-- garantia que importa e que nenhum evento seja adulterado silenciosamente;
-- apagar um atendimento leva o historico dele junto, de forma intencional.
CREATE OR REPLACE FUNCTION tracken_events_are_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'TRACKEN_EVENT_IMMUTABLE: historico de atendimento nao pode ser alterado';
END;
$$;

DROP TRIGGER IF EXISTS trigger_tracken_events_immutable
  ON tracken_ticket_events;
CREATE TRIGGER trigger_tracken_events_immutable
  BEFORE UPDATE ON tracken_ticket_events
  FOR EACH ROW
  EXECUTE FUNCTION tracken_events_are_immutable();

-- -----------------------------------------------------
-- Triggers de updated_at
--
-- A funcao update_updated_at_column() esta declarada em database/schema.sql,
-- mas nao existe em todos os ambientes: no banco de producao os triggers do
-- schema base nunca foram aplicados e updated_at e mantido pelo codigo.
-- Por isso a migration cria a funcao ela mesma, deixando as tabelas do modulo
-- corretas em qualquer ambiente. CREATE OR REPLACE com o corpo canonico e
-- seguro: onde a funcao ja existe, o resultado e o mesmo.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_tracken_carriers_updated_at ON tracken_carriers;
CREATE TRIGGER update_tracken_carriers_updated_at
  BEFORE UPDATE ON tracken_carriers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tracken_status_map_updated_at ON tracken_status_map;
CREATE TRIGGER update_tracken_status_map_updated_at
  BEFORE UPDATE ON tracken_status_map
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tracken_api_credentials_updated_at
  ON tracken_api_credentials;
CREATE TRIGGER update_tracken_api_credentials_updated_at
  BEFORE UPDATE ON tracken_api_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tracken_tickets_updated_at ON tracken_tickets;
CREATE TRIGGER update_tracken_tickets_updated_at
  BEFORE UPDATE ON tracken_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tracken_outbox_updated_at ON tracken_outbox;
CREATE TRIGGER update_tracken_outbox_updated_at
  BEFORE UPDATE ON tracken_outbox
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------
-- Seed do mapa de status
-- Recepcionado -> Em Atendimento -> Removido / Negado
-- -----------------------------------------------------
INSERT INTO tracken_status_map (
  code, label, tracken_status, color, sort_order,
  is_initial, is_final, counts_as_sla, allowed_next, is_active
)
VALUES
  (
    'recepcionado', 'Recepcionado', 'received', 'blue', 1,
    true, false, true,
    ARRAY['em_atendimento', 'cancelado']::TEXT[], true
  ),
  (
    'em_atendimento', 'Em Atendimento', 'in_progress', 'amber', 2,
    false, false, true,
    ARRAY['removido', 'negado', 'cancelado']::TEXT[], true
  ),
  (
    'removido', 'Removido', 'removed', 'green', 3,
    false, true, true,
    ARRAY['em_atendimento']::TEXT[], true
  ),
  (
    'negado', 'Negado', 'denied', 'red', 4,
    false, true, true,
    ARRAY['em_atendimento']::TEXT[], true
  ),
  (
    'cancelado', 'Cancelado', 'cancelled', 'slate', 5,
    false, true, false,
    ARRAY['em_atendimento']::TEXT[], true
  )
ON CONFLICT (code) DO UPDATE
SET
  label = EXCLUDED.label,
  tracken_status = EXCLUDED.tracken_status,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  is_initial = EXCLUDED.is_initial,
  is_final = EXCLUDED.is_final,
  counts_as_sla = EXCLUDED.counts_as_sla,
  allowed_next = EXCLUDED.allowed_next,
  is_active = true,
  updated_at = CURRENT_TIMESTAMP;

-- -----------------------------------------------------
-- Seed das transportadoras vistas no painel aprovado
-- As cores acompanham os badges do mockup.
-- -----------------------------------------------------
INSERT INTO tracken_carriers (code, name, color, is_active)
VALUES
  ('TM', 'TM Transportes', 'green', true),
  ('J3', 'J3 Logistica', 'blue', true),
  ('PEX', 'PEX Entregas', 'amber', true),
  ('TRANSMOTO', 'Transmoto', 'purple', true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  color = EXCLUDED.color,
  is_active = true,
  updated_at = CURRENT_TIMESTAMP;

-- -----------------------------------------------------
-- Comentarios de documentacao
-- -----------------------------------------------------
COMMENT ON TABLE tracken_carriers IS
  'Transportadoras que enviam atendimentos pela Tracken (TM, J3, PEX, TRANSMOTO)';
COMMENT ON TABLE tracken_status_map IS
  'Mapa configuravel de status do atendimento e transicoes permitidas';
COMMENT ON COLUMN tracken_status_map.allowed_next IS
  'Codigos de status para os quais este status pode transicionar';
COMMENT ON COLUMN tracken_status_map.counts_as_sla IS
  'Indica se atendimentos neste status entram no calculo de SLA';
COMMENT ON TABLE tracken_api_credentials IS
  'Credenciais de maquina usadas pela Tracken para chamar a API do FNVJ';
COMMENT ON COLUMN tracken_api_credentials.secret_hash IS
  'Hash SHA-256 do secret, usado para conferir o secret apresentado no Bearer';
COMMENT ON COLUMN tracken_api_credentials.secret_encrypted IS
  'Secret cifrado em AES-256-GCM; necessario apenas para validar assinatura HMAC';
COMMENT ON COLUMN tracken_api_credentials.require_signature IS
  'Quando true exige assinatura HMAC nos headers X-FNVJ-Timestamp/X-FNVJ-Signature';
COMMENT ON TABLE tracken_tickets IS
  'Atendimento de remocao recebido da Tracken; nao e uma venda do FNVJ';
COMMENT ON COLUMN tracken_tickets.shipment_id IS
  'ID de envio no Mercado Livre; chave de idempotencia da entrada';
COMMENT ON COLUMN tracken_tickets.shipping_deadline IS
  'Limite de envio no Mercado Livre; dirige a ordenacao e o SLA do painel';
COMMENT ON COLUMN tracken_tickets.payload_raw IS
  'Payload original enviado pela Tracken, preservado para reprocessamento';
COMMENT ON TABLE tracken_ticket_events IS
  'Trilha de auditoria imutavel das mudancas de cada atendimento';
COMMENT ON TABLE tracken_outbox IS
  'Fila de notificacoes para a Tracken com retry e backoff exponencial';
COMMENT ON TABLE tracken_request_log IS
  'Auditoria das chamadas de entrada e saida da integracao Tracken';

COMMIT;

-- =====================================================
-- Verificacao (executar apos a migracao)
-- =====================================================
-- SELECT code, label, sort_order, allowed_next FROM tracken_status_map
-- ORDER BY sort_order;
-- Esperado: recepcionado, em_atendimento, removido, negado, cancelado.
--
-- SELECT code, name, color FROM tracken_carriers ORDER BY code;
-- Esperado: J3, PEX, TM, TRANSMOTO.
--
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name LIKE 'tracken_%' ORDER BY table_name;
-- Esperado: 7 tabelas.
