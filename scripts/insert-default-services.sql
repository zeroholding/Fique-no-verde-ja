-- Script para inserir serviços padrão: Reclamação e Atrasos
-- Execute este SQL no Supabase SQL Editor

-- Inserir serviço: Reclamação
INSERT INTO services (
  name,
  description,
  base_price,
  sla,
  highlights,
  is_active
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
  true
) RETURNING id;

-- Anote o ID retornado acima e substitua em 'SERVICE_ID_RECLAMACAO' abaixo

-- Faixas de preço para Reclamação
-- Tipo 01 (Comum): 10 primeiros = R$ 40 cada, 11+ = R$ 15 cada
INSERT INTO service_price_ranges (
  service_id,
  sale_type,
  min_quantity,
  max_quantity,
  unit_price,
  effective_from
) VALUES
  -- Primeira faixa: 1 a 10 unidades = R$ 40 cada
  ('SERVICE_ID_RECLAMACAO', '01', 1, 10, 40.00, CURRENT_DATE),
  -- Segunda faixa: 11+ unidades = R$ 15 cada (cálculo progressivo mantém os R$ 40 das primeiras 10)
  ('SERVICE_ID_RECLAMACAO', '01', 11, NULL, 15.00, CURRENT_DATE);

-- Tipo 02 (Pacote): mesmas faixas
INSERT INTO service_price_ranges (
  service_id,
  sale_type,
  min_quantity,
  max_quantity,
  unit_price,
  effective_from
) VALUES
  -- Primeira faixa: 1 a 10 unidades = R$ 40 cada
  ('SERVICE_ID_RECLAMACAO', '02', 1, 10, 40.00, CURRENT_DATE),
  -- Segunda faixa: 11+ unidades = R$ 15 cada
  ('SERVICE_ID_RECLAMACAO', '02', 11, NULL, 15.00, CURRENT_DATE);

-- ========================================
-- Inserir serviço: Atrasos
-- ========================================
INSERT INTO services (
  name,
  description,
  base_price,
  sla,
  highlights,
  is_active
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
  true
) RETURNING id;

-- Anote o ID retornado acima e substitua em 'SERVICE_ID_ATRASOS' abaixo

-- Faixas de preço para Atrasos
-- Tipo 01 (Comum)
INSERT INTO service_price_ranges (
  service_id,
  sale_type,
  min_quantity,
  max_quantity,
  unit_price,
  effective_from
) VALUES
  -- Faixa 1: 1 a 10 unidades = R$ 30 cada
  ('SERVICE_ID_ATRASOS', '01', 1, 10, 30.00, CURRENT_DATE),
  -- Faixa 2: 11 a 20 unidades = R$ 20 cada
  ('SERVICE_ID_ATRASOS', '01', 11, 20, 20.00, CURRENT_DATE),
  -- Faixa 3: 21+ unidades = R$ 15 cada
  ('SERVICE_ID_ATRASOS', '01', 21, NULL, 15.00, CURRENT_DATE);

-- Tipo 02 (Pacote): mesmas faixas
INSERT INTO service_price_ranges (
  service_id,
  sale_type,
  min_quantity,
  max_quantity,
  unit_price,
  effective_from
) VALUES
  -- Faixa 1: 1 a 10 unidades = R$ 30 cada
  ('SERVICE_ID_ATRASOS', '02', 1, 10, 30.00, CURRENT_DATE),
  -- Faixa 2: 11 a 20 unidades = R$ 20 cada
  ('SERVICE_ID_ATRASOS', '02', 11, 20, 20.00, CURRENT_DATE),
  -- Faixa 3: 21+ unidades = R$ 15 cada
  ('SERVICE_ID_ATRASOS', '02', 21, NULL, 15.00, CURRENT_DATE);
