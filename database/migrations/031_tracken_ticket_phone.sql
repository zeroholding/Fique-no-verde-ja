-- =====================================================================
-- Migration 031 — Telefone de contato do cliente no atendimento TRACKen
-- =====================================================================
--
-- Demanda: a TRACKen passa a enviar o telefone do cliente no acionamento, e o
-- atendente precisa vê-lo junto da solicitação. O contrato é NOSSO: o campo
-- `phone` entra na lista de campos do POST /api/tracken/v1/tickets e é
-- documentado em /tracken/docapi.
--
-- Decisões:
--   - coluna ADITIVA e NULLABLE: telefone NÃO é obrigatório. Exigir o campo
--     faria o acionamento ser recusado quando a TRACKen não tivesse o contato,
--     e a solicitação é o dado que não pode ser perdido;
--   - guardado só com dígitos (DDI + DDD + número). A normalização acontece na
--     validação; a formatação para leitura é da tela;
--   - sem índice: a coluna não é filtro nem ordenação, e o volume por
--     atendimento é pequeno. O índice só pesaria na escrita.
--
-- ⚠️  APLICAR ANTES DO PUSH. Push na `coolify-deploy` dispara deploy
--     automático no Coolify, e o código novo lê esta coluna.
--
--   psql -U postgres -d postgres -f 031_tracken_ticket_phone.sql
-- =====================================================================

ALTER TABLE tracken_tickets
  ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN tracken_tickets.phone IS
  'Telefone de contato do cliente, recebido da TRACKen em `phone`. Somente digitos (DDI+DDD+numero). Nulo quando o acionamento nao trouxe o dado.';

SELECT 'coluna tracken_tickets.phone pronta' AS resultado;
