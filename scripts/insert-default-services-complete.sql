-- ========================================
-- Script para inserir serviços padrão
-- Execute no Supabase SQL Editor
-- ========================================

-- Variáveis temporárias para armazenar IDs
DO $$
DECLARE
  reclamacao_id UUID;
  atrasos_id UUID;
BEGIN
  -- ========================================
  -- 1. SERVIÇO: RECLAMAÇÃO
  -- ========================================

  -- Inserir serviço Reclamação
  INSERT INTO services (
    name,
    description,
    base_price,
    sla,
    highlights,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    'Reclamação',
    'Serviço de remoção de reclamações',
    40.00,
    'Até 72 horas',
    ARRAY[
      'Cálculo progressivo de preço',
      'Primeiras 10 unidades com valor especial',
      'Desconto a partir da 11ª unidade'
    ],
    true,
    NOW(),
    NOW()
  ) RETURNING id INTO reclamacao_id;

  RAISE NOTICE 'Serviço Reclamação criado com ID: %', reclamacao_id;

  -- Faixas de preço para Reclamação - Tipo 01 (Comum)
  INSERT INTO service_price_ranges (
    service_id,
    sale_type,
    min_quantity,
    max_quantity,
    unit_price,
    effective_from
  ) VALUES
    -- Faixa 1: 1 a 10 unidades = R$ 40 cada
    (reclamacao_id, '01', 1, 10, 40.00, CURRENT_DATE),
    -- Faixa 2: 11+ unidades = R$ 15 cada (mantém R$ 40 para as primeiras 10)
    (reclamacao_id, '01', 11, NULL, 15.00, CURRENT_DATE);

  RAISE NOTICE 'Faixas de preço (Tipo 01 - Comum) criadas para Reclamação';

  -- Faixas de preço para Reclamação - Tipo 02 (Pacote)
  INSERT INTO service_price_ranges (
    service_id,
    sale_type,
    min_quantity,
    max_quantity,
    unit_price,
    effective_from
  ) VALUES
    -- Faixa 1: 1 a 10 unidades = R$ 40 cada
    (reclamacao_id, '02', 1, 10, 40.00, CURRENT_DATE),
    -- Faixa 2: 11+ unidades = R$ 15 cada
    (reclamacao_id, '02', 11, NULL, 15.00, CURRENT_DATE);

  RAISE NOTICE 'Faixas de preço (Tipo 02 - Pacote) criadas para Reclamação';

  -- ========================================
  -- 2. SERVIÇO: ATRASOS
  -- ========================================

  -- Inserir serviço Atrasos
  INSERT INTO services (
    name,
    description,
    base_price,
    sla,
    highlights,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    'Atrasos',
    'Serviço de remoção de atrasos',
    30.00,
    'Até 72 horas',
    ARRAY[
      'Preço escalonado por quantidade',
      'Desconto progressivo em grandes volumes',
      'Processamento rápido'
    ],
    true,
    NOW(),
    NOW()
  ) RETURNING id INTO atrasos_id;

  RAISE NOTICE 'Serviço Atrasos criado com ID: %', atrasos_id;

  -- Faixas de preço para Atrasos - Tipo 01 (Comum)
  INSERT INTO service_price_ranges (
    service_id,
    sale_type,
    min_quantity,
    max_quantity,
    unit_price,
    effective_from
  ) VALUES
    -- Faixa 1: 1 a 10 unidades = R$ 30 cada
    (atrasos_id, '01', 1, 10, 30.00, CURRENT_DATE),
    -- Faixa 2: 11 a 20 unidades = R$ 20 cada
    (atrasos_id, '01', 11, 20, 20.00, CURRENT_DATE),
    -- Faixa 3: 21+ unidades = R$ 15 cada
    (atrasos_id, '01', 21, NULL, 15.00, CURRENT_DATE);

  RAISE NOTICE 'Faixas de preço (Tipo 01 - Comum) criadas para Atrasos';

  -- Faixas de preço para Atrasos - Tipo 02 (Pacote)
  INSERT INTO service_price_ranges (
    service_id,
    sale_type,
    min_quantity,
    max_quantity,
    unit_price,
    effective_from
  ) VALUES
    -- Faixa 1: 1 a 10 unidades = R$ 30 cada
    (atrasos_id, '02', 1, 10, 30.00, CURRENT_DATE),
    -- Faixa 2: 11 a 20 unidades = R$ 20 cada
    (atrasos_id, '02', 11, 20, 20.00, CURRENT_DATE),
    -- Faixa 3: 21+ unidades = R$ 15 cada
    (atrasos_id, '02', 21, NULL, 15.00, CURRENT_DATE);

  RAISE NOTICE 'Faixas de preço (Tipo 02 - Pacote) criadas para Atrasos';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'SERVIÇOS PADRÃO CRIADOS COM SUCESSO!';
  RAISE NOTICE '========================================';

END $$;

-- Verificar os serviços criados
SELECT
  s.id,
  s.name,
  s.description,
  s.base_price,
  s.sla,
  s.is_active,
  COUNT(spr.id) as total_price_ranges
FROM services s
LEFT JOIN service_price_ranges spr ON spr.service_id = s.id
WHERE s.name IN ('Reclamação', 'Atrasos')
GROUP BY s.id, s.name, s.description, s.base_price, s.sla, s.is_active
ORDER BY s.name;

-- Verificar todas as faixas de preço criadas
SELECT
  s.name as service_name,
  spr.sale_type,
  CASE
    WHEN spr.sale_type = '01' THEN 'Comum'
    WHEN spr.sale_type = '02' THEN 'Pacote'
  END as sale_type_label,
  spr.min_quantity,
  spr.max_quantity,
  spr.unit_price,
  spr.effective_from
FROM service_price_ranges spr
JOIN services s ON s.id = spr.service_id
WHERE s.name IN ('Reclamação', 'Atrasos')
ORDER BY s.name, spr.sale_type, spr.min_quantity;
