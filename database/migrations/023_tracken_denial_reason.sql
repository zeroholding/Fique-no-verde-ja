-- =====================================================
-- Migracao 023: motivo obrigatorio ao negar um atendimento
--
-- Demanda: "Se negada, informar 1 dos 3 motivos:
--   venda ja analisada anteriormente | excesso de contato |
--   bipagem muito longe do local de entrega"
--
-- POR QUE UMA COLUNA NOVA, E NAO `resolution_note`
--   `resolution_note` e texto livre e OPCIONAL, usado para observacao de
--   qualquer transicao de status. Guardar o motivo ali significaria nao poder
--   contar quantas negativas foram por excesso de contato sem interpretar
--   texto digitado a mao. Os 14 atendimentos negados hoje tem
--   `resolution_note` vazia, o que confirma que o campo nao cumpre esse papel.
--
--   `delay_reason` tambem nao serve: e o motivo do ATRASO DO ENVIO, informado
--   pela TRACKen, nao a justificativa do atendente ao negar.
--
-- POR QUE CODIGO E NAO O TEXTO
--   A coluna guarda `venda_analisada`, nao "Venda ja analisada anteriormente".
--   Reescrever o texto passa a ser mudanca em lib/tracken/denial.ts, sem
--   precisar migrar registro historico -- casar por texto quebraria em
--   silencio no primeiro ajuste de redacao.
--
-- POR QUE NAO EXISTE CHECK CRUZADO COM `status`
--   Um CHECK do tipo `(status = 'negado' OR denial_reason IS NULL)` pareceria
--   mais rigoroso, mas impediria REABRIR um atendimento negado: a transicao
--   `negado -> em_atendimento` (privilegio de admin) falharia enquanto o
--   motivo estivesse preenchido, e apagar o motivo na reabertura destruiria o
--   registro de por que ele havia sido negado. O motivo fica como historico; a
--   obrigatoriedade e imposta na aplicacao, em changeTicketStatus.
--
-- Idempotente: pode ser executada mais de uma vez.
-- =====================================================

BEGIN;

ALTER TABLE tracken_tickets
  ADD COLUMN IF NOT EXISTS denial_reason TEXT;

-- Codigo fora da lista e erro de programacao, nao entrada de usuario: a UI
-- oferece apenas tres botoes. O CHECK existe para que um caminho novo de
-- escrita (script, integracao, correcao manual) nao consiga inventar um quarto
-- motivo e sujar a contagem.
ALTER TABLE tracken_tickets
  DROP CONSTRAINT IF EXISTS tracken_tickets_denial_reason_check;
ALTER TABLE tracken_tickets
  ADD CONSTRAINT tracken_tickets_denial_reason_check
  CHECK (
    denial_reason IS NULL
    OR denial_reason IN (
      'venda_analisada',
      'excesso_contato',
      'bipagem_distante'
    )
  );

-- Contagem de negativas por motivo e a pergunta que esta coluna existe para
-- responder, e ela filtra por status antes de agrupar.
CREATE INDEX IF NOT EXISTS idx_tracken_tickets_denial_reason
  ON tracken_tickets (denial_reason)
  WHERE denial_reason IS NOT NULL;

COMMENT ON COLUMN tracken_tickets.denial_reason IS
  'Motivo da negativa (codigo). Obrigatorio ao mudar o status para negado; a lista canonica esta em lib/tracken/denial.ts';

COMMIT;

-- =====================================================
-- Verificacao (executar apos a migracao)
-- =====================================================
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_name = 'tracken_tickets' AND column_name = 'denial_reason';
-- Esperado: 1 linha, text, YES.
--
-- SELECT conname FROM pg_constraint
--  WHERE conname = 'tracken_tickets_denial_reason_check';
-- Esperado: 1 linha.
--
-- Os 14 atendimentos negados antes desta migracao ficam com denial_reason
-- NULO. Sao historico: nao ha como descobrir o motivo retroativamente, e
-- inventar um falsearia a contagem. A tela mostra "Motivo nao registrado"
-- nesses casos.
-- SELECT COUNT(*) FROM tracken_tickets
--  WHERE status = 'negado' AND denial_reason IS NULL;
-- Esperado: 14 (e nao aumenta, porque a aplicacao passa a exigir o motivo).
