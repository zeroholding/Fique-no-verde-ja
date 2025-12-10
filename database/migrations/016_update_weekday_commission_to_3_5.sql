-- Migration: Atualiza politica geral de dias uteis para 3,5%
-- Alvo: politicas gerais (scope = 'general') aplicadas em dias uteis (applies_to = 'weekdays')

UPDATE commission_policies
SET
  value = 3.5,
  description = 'Comissao de 3,5% sobre vendas em dias uteis (seg-sex)'
WHERE scope = 'general'
  AND applies_to = 'weekdays';

-- Opcional: garantir consistencia em ambientes com seed anterior
-- (mantemos sale_type como 'all' para seguir a logica atual)
