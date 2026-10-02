-- =====================================================
-- Migration 026: corte final da idempotencia Tracken
-- =====================================================
--
-- PRE-REQUISITOS:
--   1. migration 025 aplicada e verificada;
--   2. codigo que usa ON CONFLICT (environment, shipment_id) publicado;
--   3. dispatcher e chamadas M2M saudaveis no codigo novo.
--
-- Esta fase remove a UNIQUE global de shipment_id. Depois dela, o mesmo ID
-- pode existir uma vez em production e uma vez em sandbox. Nao volte ao codigo
-- antigo, que depende de ON CONFLICT (shipment_id).

BEGIN;

DO $migration$
DECLARE
  composed_index REGCLASS;
  old_constraint RECORD;
  old_index RECORD;
  remaining BIGINT;
BEGIN
  SELECT to_regclass('uq_tracken_tickets_environment_shipment_id')
    INTO composed_index;

  IF composed_index IS NULL OR NOT EXISTS (
    SELECT 1
      FROM pg_index
     WHERE indexrelid = composed_index
       AND indisunique = true
       AND indisvalid = true
  ) THEN
    RAISE EXCEPTION
      'TRACKEN_COMPOSITE_IDEMPOTENCY_MISSING: aplique/verifique a migration 025 antes da 026';
  END IF;

  -- Remove constraints UNIQUE de uma unica coluna sobre shipment_id.
  FOR old_constraint IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'tracken_tickets'::regclass
       AND c.contype = 'u'
       AND array_length(c.conkey, 1) = 1
       AND (
         SELECT a.attname
           FROM pg_attribute a
          WHERE a.attrelid = c.conrelid
            AND a.attnum = c.conkey[1]
       ) = 'shipment_id'
  LOOP
    EXECUTE format(
      'ALTER TABLE tracken_tickets DROP CONSTRAINT %I',
      old_constraint.conname
    );
  END LOOP;

  -- Cobre tambem indice UNIQUE standalone criado fora da migration 019.
  FOR old_index IN
    SELECT namespace.nspname AS schema_name, idx.relname AS index_name
      FROM pg_index i
      JOIN pg_class tbl ON tbl.oid = i.indrelid
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_namespace namespace ON namespace.oid = idx.relnamespace
      LEFT JOIN pg_constraint c ON c.conindid = i.indexrelid
      JOIN pg_attribute a
        ON a.attrelid = i.indrelid
       AND a.attnum = i.indkey[0]
     WHERE i.indrelid = 'tracken_tickets'::regclass
       AND i.indisunique = true
       AND i.indnatts = 1
       AND a.attname = 'shipment_id'
       AND c.oid IS NULL
  LOOP
    EXECUTE format(
      'DROP INDEX %I.%I',
      old_index.schema_name,
      old_index.index_name
    );
  END LOOP;

  SELECT COUNT(*)
    INTO remaining
    FROM pg_index i
    JOIN pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attnum = i.indkey[0]
   WHERE i.indrelid = 'tracken_tickets'::regclass
     AND i.indisunique = true
     AND i.indnatts = 1
     AND a.attname = 'shipment_id';

  IF remaining > 0 THEN
    RAISE EXCEPTION
      'TRACKEN_GLOBAL_IDEMPOTENCY_STILL_PRESENT: % indice(s) UNIQUE globais restaram',
      remaining;
  END IF;
END;
$migration$;

COMMENT ON INDEX uq_tracken_tickets_environment_shipment_id IS
  'Idempotencia final do Tracken: shipment_id unico dentro de production ou sandbox';

COMMIT;

-- Verificacao SOMENTE LEITURA:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = current_schema()
--   AND tablename = 'tracken_tickets'
--   AND indexdef ILIKE '%shipment_id%';
--
-- Esperado: uq_tracken_tickets_environment_shipment_id presente e nenhum
-- indice UNIQUE apenas sobre shipment_id.
