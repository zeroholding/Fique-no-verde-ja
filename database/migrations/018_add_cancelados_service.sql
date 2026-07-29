-- =====================================================
-- Migracao 018: cria o 3o servico "Cancelados"
--
-- Regra de negocio: a precificacao de "Cancelados" deve ser
-- IDENTICA a de "Reclamacao". Por isso as faixas NAO sao
-- digitadas aqui: elas sao COPIADAS do servico Reclamacao
-- como ele esta no banco no momento da execucao.
-- Assim nao ha risco de divergir de eventuais ajustes feitos
-- pela interface administrativa.
--
-- Idempotente: pode ser executada mais de uma vez.
-- =====================================================

BEGIN;

-- Helper de normalizacao (remove acento e caixa) para localizar
-- o servico de reclamacao independente de como o nome foi gravado
-- ("Reclamacao", "Reclamação", "Reclamacoes"...).
CREATE OR REPLACE FUNCTION fnvj_normalize_text(p_value TEXT)
RETURNS TEXT AS $$
  SELECT LOWER(
    TRANSLATE(
      TRIM(COALESCE(p_value, '')),
      'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
    )
  );
$$ LANGUAGE sql IMMUTABLE;

-- 1) Cria o servico "Cancelados" espelhando os metadados da Reclamacao
--    (base_price, sla e is_active), mudando apenas nome e descricao.
INSERT INTO services (name, description, base_price, sla, highlights, is_active)
SELECT
  'Cancelados',
  'Servico de remocao de cancelados, com precificacao equivalente a de reclamacao.',
  rec.base_price,
  rec.sla,
  rec.highlights,
  true
FROM services rec
WHERE fnvj_normalize_text(rec.name) LIKE '%reclamac%'
ORDER BY rec.created_at
LIMIT 1
ON CONFLICT (name) DO NOTHING;

-- Fallback: se por algum motivo nao existir o servico de reclamacao,
-- ainda assim garantimos a criacao do servico Cancelados.
INSERT INTO services (name, description, base_price, sla, highlights, is_active)
SELECT
  'Cancelados',
  'Servico de remocao de cancelados, com precificacao equivalente a de reclamacao.',
  0,
  'Ate 3 dias uteis',
  '[]'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM services WHERE fnvj_normalize_text(name) = 'cancelados'
);

-- 2) Replica as faixas de preco da Reclamacao para Cancelados.
--    Limpa antes para manter a operacao idempotente e sempre
--    espelhada (evita faixas duplicadas em reexecucoes).
DELETE FROM service_price_ranges
WHERE service_id IN (
  SELECT id FROM services WHERE fnvj_normalize_text(name) = 'cancelados'
);

INSERT INTO service_price_ranges (
  service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from
)
SELECT
  can.id,
  r.sale_type,
  r.min_quantity,
  r.max_quantity,
  r.unit_price,
  r.effective_from
FROM service_price_ranges r
JOIN services rec ON rec.id = r.service_id
CROSS JOIN (
  SELECT id FROM services
  WHERE fnvj_normalize_text(name) = 'cancelados'
  LIMIT 1
) can
WHERE fnvj_normalize_text(rec.name) LIKE '%reclamac%';

COMMIT;

-- =====================================================
-- Verificacao (executar apos a migracao)
-- =====================================================
-- SELECT s.name, r.sale_type, r.min_quantity, r.max_quantity, r.unit_price
-- FROM services s
-- LEFT JOIN service_price_ranges r ON r.service_id = s.id
-- WHERE fnvj_normalize_text(s.name) IN ('cancelados')
--    OR fnvj_normalize_text(s.name) LIKE '%reclamac%'
-- ORDER BY s.name, r.sale_type, r.min_quantity;
--
-- Esperado: as faixas de "Cancelados" identicas as de "Reclamacao".
