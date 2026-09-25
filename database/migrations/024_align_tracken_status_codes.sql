-- =====================================================
-- Migration 024: alinhar tracken_status ao contrato público
-- Data: 2026-09-25
-- =====================================================
--
-- Decisão confirmada pela TRACKen em homologação:
-- os valores devolvidos no campo `tracken_status` devem ser os mesmos códigos
-- portugueses publicados na documentação FNVJ. `to_status` e `tracken_status`
-- passam, portanto, a carregar o mesmo valor estável.
--
-- Além do mapa, corrige somente eventos ainda não entregues (`pending/failed`).
-- Eventos `sent/dead`, outros tipos de evento e os demais campos do payload
-- permanecem intocados.
--
-- Idempotente: executar novamente não altera linhas já alinhadas.

BEGIN;

UPDATE tracken_status_map
SET tracken_status = code,
    updated_at = CURRENT_TIMESTAMP
WHERE code IN (
  'recepcionado',
  'em_atendimento',
  'removido',
  'negado',
  'cancelado'
)
  AND tracken_status IS DISTINCT FROM code;

UPDATE tracken_outbox
SET payload = jsonb_set(
  payload,
  '{tracken_status}',
  to_jsonb(payload->>'to_status'),
  true
)
WHERE status IN ('pending', 'failed')
  AND event_type = 'ticket.status_changed'
  AND payload->>'to_status' IN (
    'recepcionado',
    'em_atendimento',
    'removido',
    'negado',
    'cancelado'
  )
  AND payload->>'tracken_status' IS DISTINCT FROM payload->>'to_status';

UPDATE tracken_outbox
SET payload = jsonb_set(
  payload,
  '{tracken_status}',
  to_jsonb(payload->>'status'),
  true
)
WHERE status IN ('pending', 'failed')
  AND event_type = 'ticket.received'
  AND payload->>'status' IN (
    'recepcionado',
    'em_atendimento',
    'removido',
    'negado',
    'cancelado'
  )
  AND payload->>'tracken_status' IS DISTINCT FROM payload->>'status';

COMMENT ON COLUMN tracken_status_map.tracken_status IS
  'Codigo enviado a TRACKen no webhook; desde 2026-09-25 e igual ao code interno documentado';

COMMIT;

-- Verificacao somente leitura:
-- SELECT code, tracken_status
-- FROM tracken_status_map
-- ORDER BY sort_order;
