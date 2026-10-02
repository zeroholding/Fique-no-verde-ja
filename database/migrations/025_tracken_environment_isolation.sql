-- =====================================================
-- Migration 025: isolamento Tracken por ambiente
-- =====================================================
--
-- ROLLOUT EM DUAS FASES (SEM CORTE DE ESCRITA NA 025):
-- esta migration e aditiva e mantem temporariamente a UNIQUE global de
-- shipment_id. Tanto o codigo antigo (`ON CONFLICT (shipment_id)`) quanto o
-- codigo novo (`ON CONFLICT (environment, shipment_id)`) continuam validos.
-- Depois de publicar o codigo novo, aplicar a migration 026 para remover a
-- UNIQUE global; somente depois liberar o segundo ambiente.
--
-- Esta migration NAO configura destinos e NAO assume production como default.
-- Linha legada sem cadeia credential -> environment (ou outbox -> ticket) faz a
-- transacao inteira falhar explicitamente para exigir classificacao manual.

BEGIN;

-- Remove qualquer caminho legado que transforme ausencia em production.
ALTER TABLE tracken_api_credentials
  ALTER COLUMN environment DROP DEFAULT;

-- Idempotente mesmo se alguem tiver criado as colunas manualmente com default.
ALTER TABLE tracken_tickets
  ADD COLUMN IF NOT EXISTS environment VARCHAR(20),
  ALTER COLUMN environment DROP DEFAULT;

ALTER TABLE tracken_outbox
  ADD COLUMN IF NOT EXISTS environment VARCHAR(20),
  ALTER COLUMN environment DROP DEFAULT;

-- O ticket herda o ambiente da credencial que autenticou sua criacao.
UPDATE tracken_tickets t
   SET environment = c.environment
  FROM tracken_api_credentials c
 WHERE t.environment IS NULL
   AND t.credential_id = c.id;

DO $migration$
DECLARE
  unresolved BIGINT;
  mismatched BIGINT;
BEGIN
  SELECT COUNT(*)
    INTO unresolved
    FROM tracken_tickets
   WHERE environment IS NULL
      OR environment NOT IN ('production', 'sandbox');

  IF unresolved > 0 THEN
    RAISE EXCEPTION
      'TRACKEN_ENVIRONMENT_BACKFILL_FAILED: % ticket(s) sem ambiente classificavel',
      unresolved
      USING HINT =
        'Restaure/corrija credential_id e environment explicitamente; a migration nunca assume production.';
  END IF;

  SELECT COUNT(*)
    INTO mismatched
    FROM tracken_tickets t
    JOIN tracken_api_credentials c ON c.id = t.credential_id
   WHERE t.environment IS DISTINCT FROM c.environment;

  IF mismatched > 0 THEN
    RAISE EXCEPTION
      'TRACKEN_ENVIRONMENT_MISMATCH: % ticket(s) divergem da credencial de origem',
      mismatched
      USING HINT =
        'Corrija a classificacao antes do rollout; nao existe fallback entre ambientes.';
  END IF;
END;
$migration$;

-- A outbox e um snapshot do ambiente do ticket, nao da configuracao atual da
-- credencial. Revogar/trocar uma credencial nunca redireciona evento existente.
UPDATE tracken_outbox o
   SET environment = t.environment
  FROM tracken_tickets t
 WHERE o.environment IS NULL
   AND o.ticket_id = t.id;

DO $migration$
DECLARE
  unresolved BIGINT;
  mismatched BIGINT;
BEGIN
  SELECT COUNT(*)
    INTO unresolved
    FROM tracken_outbox
   WHERE environment IS NULL
      OR environment NOT IN ('production', 'sandbox');

  IF unresolved > 0 THEN
    RAISE EXCEPTION
      'TRACKEN_OUTBOX_ENVIRONMENT_BACKFILL_FAILED: % evento(s) sem ticket/ambiente classificavel',
      unresolved
      USING HINT =
        'Restaure/corrija o ticket relacionado; eventos desconhecidos nao podem ser enviados.';
  END IF;

  SELECT COUNT(*)
    INTO mismatched
    FROM tracken_outbox o
    JOIN tracken_tickets t ON t.id = o.ticket_id
   WHERE o.environment IS DISTINCT FROM t.environment;

  IF mismatched > 0 THEN
    RAISE EXCEPTION
      'TRACKEN_OUTBOX_ENVIRONMENT_MISMATCH: % evento(s) divergem do ticket',
      mismatched
      USING HINT =
        'Corrija a classificacao antes do rollout; a fila nao faz fallback de ambiente.';
  END IF;
END;
$migration$;

ALTER TABLE tracken_tickets
  ALTER COLUMN environment SET NOT NULL;
ALTER TABLE tracken_outbox
  ALTER COLUMN environment SET NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'tracken_tickets'::regclass
       AND conname = 'tracken_tickets_environment_check'
  ) THEN
    ALTER TABLE tracken_tickets
      ADD CONSTRAINT tracken_tickets_environment_check
      CHECK (environment IN ('production', 'sandbox'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'tracken_outbox'::regclass
       AND conname = 'tracken_outbox_environment_check'
  ) THEN
    ALTER TABLE tracken_outbox
      ADD CONSTRAINT tracken_outbox_environment_check
      CHECK (environment IN ('production', 'sandbox'));
  END IF;
END;
$migration$;

-- Cria primeiro a nova chave para nao abrir uma janela sem idempotencia.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tracken_tickets_environment_shipment_id
  ON tracken_tickets(environment, shipment_id);

-- A UNIQUE global de shipment_id permanece nesta fase para manter o codigo
-- publicado compativel. A migration 026 a remove depois do deploy novo.
-- Ate a 026, ainda nao libere trafego com o mesmo shipment_id nos dois ambientes.

-- Necessaria como chave candidata da FK composta da outbox.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'tracken_tickets'::regclass
       AND conname = 'tracken_tickets_id_environment_key'
  ) THEN
    ALTER TABLE tracken_tickets
      ADD CONSTRAINT tracken_tickets_id_environment_key
      UNIQUE (id, environment);
  END IF;
END;
$migration$;

-- A FK composta torna impossivel associar um evento ao ambiente oposto ao do
-- ticket, inclusive para escritores SQL que nao passam pela aplicacao.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'tracken_outbox'::regclass
       AND conname = 'tracken_outbox_ticket_environment_fkey'
  ) THEN
    ALTER TABLE tracken_outbox
      ADD CONSTRAINT tracken_outbox_ticket_environment_fkey
      FOREIGN KEY (ticket_id, environment)
      REFERENCES tracken_tickets(id, environment)
      ON DELETE CASCADE;
  END IF;
END;
$migration$;

-- Escritores legados podem omitir environment: o banco deriva da credencial,
-- valida valor explicito e congela a classificacao depois do INSERT.
CREATE OR REPLACE FUNCTION tracken_guard_ticket_environment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  credential_environment VARCHAR(20);
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.environment IS DISTINCT FROM OLD.environment THEN
    RAISE EXCEPTION
      'TRACKEN_TICKET_ENVIRONMENT_IMMUTABLE: environment nao pode mudar depois do INSERT';
  END IF;

  IF NEW.environment IS NULL THEN
    IF NEW.credential_id IS NULL THEN
      RAISE EXCEPTION
        'TRACKEN_TICKET_ENVIRONMENT_REQUIRED: informe environment ou credential_id';
    END IF;

    SELECT c.environment
      INTO credential_environment
      FROM tracken_api_credentials c
     WHERE c.id = NEW.credential_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'TRACKEN_TICKET_CREDENTIAL_NOT_FOUND: credencial % nao existe',
        NEW.credential_id;
    END IF;

    NEW.environment := credential_environment;
  END IF;

  IF NEW.credential_id IS NOT NULL THEN
    SELECT c.environment
      INTO credential_environment
      FROM tracken_api_credentials c
     WHERE c.id = NEW.credential_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'TRACKEN_TICKET_CREDENTIAL_NOT_FOUND: credencial % nao existe',
        NEW.credential_id;
    END IF;

    IF NEW.environment IS DISTINCT FROM credential_environment THEN
      RAISE EXCEPTION
        'TRACKEN_TICKET_ENVIRONMENT_MISMATCH: ticket % / credencial %',
        NEW.environment,
        credential_environment;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_tracken_ticket_environment_insert
  ON tracken_tickets;
CREATE TRIGGER trigger_tracken_ticket_environment_insert
  BEFORE INSERT ON tracken_tickets
  FOR EACH ROW
  EXECUTE FUNCTION tracken_guard_ticket_environment();

DROP TRIGGER IF EXISTS trigger_tracken_ticket_environment_update
  ON tracken_tickets;
CREATE TRIGGER trigger_tracken_ticket_environment_update
  BEFORE UPDATE OF environment, credential_id ON tracken_tickets
  FOR EACH ROW
  EXECUTE FUNCTION tracken_guard_ticket_environment();

-- Mesmo principio na outbox: deriva do ticket, valida valor explicito e impede
-- que UPDATE redirecione uma entrega que ja foi criada.
CREATE OR REPLACE FUNCTION tracken_guard_outbox_environment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  ticket_environment VARCHAR(20);
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.environment IS DISTINCT FROM OLD.environment THEN
    RAISE EXCEPTION
      'TRACKEN_OUTBOX_ENVIRONMENT_IMMUTABLE: environment nao pode mudar depois do INSERT';
  END IF;

  SELECT t.environment
    INTO ticket_environment
    FROM tracken_tickets t
   WHERE t.id = NEW.ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'TRACKEN_OUTBOX_TICKET_NOT_FOUND: ticket % nao existe',
      NEW.ticket_id;
  END IF;

  IF NEW.environment IS NULL THEN
    NEW.environment := ticket_environment;
  ELSIF NEW.environment IS DISTINCT FROM ticket_environment THEN
    RAISE EXCEPTION
      'TRACKEN_OUTBOX_ENVIRONMENT_MISMATCH: outbox % / ticket %',
      NEW.environment,
      ticket_environment;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_tracken_outbox_environment_insert
  ON tracken_outbox;
CREATE TRIGGER trigger_tracken_outbox_environment_insert
  BEFORE INSERT ON tracken_outbox
  FOR EACH ROW
  EXECUTE FUNCTION tracken_guard_outbox_environment();

DROP TRIGGER IF EXISTS trigger_tracken_outbox_environment_update
  ON tracken_outbox;
CREATE TRIGGER trigger_tracken_outbox_environment_update
  BEFORE UPDATE OF environment, ticket_id ON tracken_outbox
  FOR EACH ROW
  EXECUTE FUNCTION tracken_guard_outbox_environment();

-- Uma credencial nao pode trocar de ambiente e levar o destino junto depois de
-- tickets/outbox terem sido classificados pelo valor original.
CREATE OR REPLACE FUNCTION tracken_credential_environment_is_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.environment IS DISTINCT FROM OLD.environment THEN
    RAISE EXCEPTION
      'TRACKEN_CREDENTIAL_ENVIRONMENT_IMMUTABLE: environment nao pode mudar depois do INSERT';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_tracken_credential_environment_immutable
  ON tracken_api_credentials;
CREATE TRIGGER trigger_tracken_credential_environment_immutable
  BEFORE UPDATE OF environment ON tracken_api_credentials
  FOR EACH ROW
  EXECUTE FUNCTION tracken_credential_environment_is_immutable();

-- Consultas M2M, diagnostico e claim usam environment como primeiro recorte.
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_environment_received
  ON tracken_tickets(environment, received_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_tracken_outbox_environment_status
  ON tracken_outbox(environment, status);

CREATE INDEX IF NOT EXISTS idx_tracken_outbox_environment_claim
  ON tracken_outbox(environment, next_attempt_at, created_at, id)
  WHERE status IN ('pending', 'failed');

-- Bloqueia configuracao cruzada antes de qualquer dispatcher novo ler a fila.
-- A URL antiga e exclusivamente sandbox; a nova e exclusivamente production.
DO $migration$
DECLARE
  invalid_target RECORD;
BEGIN
  SELECT name, environment, webhook_url
    INTO invalid_target
    FROM tracken_api_credentials
   WHERE is_active = true
     AND webhook_url IS NOT NULL
     AND btrim(webhook_url) <> ''
     AND NOT (
       (environment = 'production' AND btrim(webhook_url) =
         'https://seller.tracken.app.br/api/ferramentas/controle-reputacao/webhooks/fnvj')
       OR
       (environment = 'sandbox' AND btrim(webhook_url) =
         'https://homologasellercore.tracken.dev.br/api/ferramentas/controle-reputacao/webhooks/fnvj')
     )
   ORDER BY created_at
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'TRACKEN_WEBHOOK_ENVIRONMENT_MISMATCH: credencial % (%) aponta para %',
      invalid_target.name,
      invalid_target.environment,
      invalid_target.webhook_url
      USING HINT =
        'Production deve usar seller.tracken.app.br e sandbox deve usar homologasellercore.tracken.dev.br.';
  END IF;
END;
$migration$;

-- Falha com mensagem operacional antes de criar o indice, em vez de deixar um
-- erro generico de duplicidade esconder quais ambientes precisam de limpeza.
DO $migration$
DECLARE
  duplicate_environment RECORD;
BEGIN
  SELECT environment, COUNT(*) AS total
    INTO duplicate_environment
    FROM tracken_api_credentials
   WHERE is_active = true
     AND webhook_url IS NOT NULL
     AND btrim(webhook_url) <> ''
   GROUP BY environment
  HAVING COUNT(*) > 1
   ORDER BY environment
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'TRACKEN_WEBHOOK_TARGET_CONFLICT: ambiente % tem % destinos ativos configurados',
      duplicate_environment.environment,
      duplicate_environment.total
      USING HINT =
        'Limpe ou revogue o destino excedente antes de reaplicar a migration.';
  END IF;
END;
$migration$;

-- Expiracao nao entra no predicado porque CURRENT_TIMESTAMP nao e imutavel em
-- indice parcial. `is_active` + URL configurada definem o destino operacional;
-- credencial expirada deve ser revogada ou ter o destino limpo antes da troca.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tracken_credentials_active_webhook_environment
  ON tracken_api_credentials(environment)
  WHERE is_active = true
    AND webhook_url IS NOT NULL
    AND btrim(webhook_url) <> '';

COMMENT ON COLUMN tracken_tickets.environment IS
  'Ambiente Tracken imutavel do ticket; derivado da credencial de entrada, sem default';
COMMENT ON COLUMN tracken_outbox.environment IS
  'Snapshot imutavel do ambiente do ticket usado para rotear a entrega, sem fallback';
COMMENT ON INDEX uq_tracken_tickets_environment_shipment_id IS
  'Idempotencia de shipment_id isolada entre production e sandbox';
COMMENT ON INDEX uq_tracken_credentials_active_webhook_environment IS
  'No maximo um destino outbound ativo e configurado por ambiente Tracken';

COMMIT;

-- =====================================================
-- Verificacao/rollout (SOMENTE LEITURA; executar manualmente)
-- =====================================================
-- 1) Toda linha classificada e outbox coerente com o ticket (todos devem ser 0):
-- SELECT COUNT(*) AS tickets_invalidos
-- FROM tracken_tickets
-- WHERE environment NOT IN ('production', 'sandbox');
--
-- SELECT COUNT(*) AS outbox_invalida
-- FROM tracken_outbox o
-- JOIN tracken_tickets t ON t.id = o.ticket_id
-- WHERE o.environment NOT IN ('production', 'sandbox')
--    OR o.environment IS DISTINCT FROM t.environment;
--
-- 2) Nesta fase, a chave global antiga E a composta devem aparecer:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = current_schema()
--   AND tablename = 'tracken_tickets'
--   AND indexdef ILIKE '%shipment_id%';
--
-- A migration 026 confirmara a composta e removera somente a global.
--
-- 3) No maximo um destino ativo configurado por ambiente:
-- SELECT environment, COUNT(*) AS destinos
-- FROM tracken_api_credentials
-- WHERE is_active = true
--   AND webhook_url IS NOT NULL
--   AND btrim(webhook_url) <> ''
-- GROUP BY environment
-- ORDER BY environment;
--
-- 4) Backlog por ambiente antes de liberar o dispatcher:
-- SELECT environment, status, COUNT(*) AS total
-- FROM tracken_outbox
-- GROUP BY environment, status
-- ORDER BY environment, status;
--
-- A migration 025 apenas prepara o schema sem remover a compatibilidade do
-- codigo antigo. Publique o codigo novo, aplique a 026, verifique os dois
-- ambientes e somente entao configure/libere as credenciais e o dispatcher.