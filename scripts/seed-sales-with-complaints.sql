-- ============================================================================
-- SEED: Vendas com Reclamações para Testar Cálculo Escalonado
-- ============================================================================
-- Exemplos de vendas com MAIS de 10 reclamações para validar:
-- - Primeiros 10: R$ 40,00 cada = R$ 400,00
-- - A partir do 11º: R$ 15,00 cada
-- ============================================================================

-- Limpar dados de teste anteriores (se existirem)
DELETE FROM sale_items WHERE sale_id IN (
  SELECT id FROM sales WHERE client_id IN (
    SELECT id FROM clients WHERE name LIKE 'Cliente Teste%'
  )
);

DELETE FROM sales WHERE client_id IN (
  SELECT id FROM clients WHERE name LIKE 'Cliente Teste%'
);

DELETE FROM clients WHERE name LIKE 'Cliente Teste%';

-- ============================================================================
-- EXEMPLO 1: Venda com exatamente 15 reclamações
-- ============================================================================
-- Cálculo esperado:
-- - 10 primeiras: 10 × R$ 40,00 = R$ 400,00
-- - 5 seguintes:   5 × R$ 15,00 = R$  75,00
-- - TOTAL:                        = R$ 475,00
-- ============================================================================

INSERT INTO clients (name, email, phone, cpf_cnpj)
VALUES ('Cliente Teste 1', 'teste1@example.com', '11999999001', '12345678901');

INSERT INTO sales (client_id, total_amount, payment_method, notes)
VALUES (
  (SELECT id FROM clients WHERE email = 'teste1@example.com'),
  475.00,
  'pix',
  'Venda com 15 reclamações - Teste de cálculo escalonado'
);

-- Adicionar 15 itens do serviço "Vendas com Reclamações"
INSERT INTO sale_items (sale_id, service_id, quantity, unit_price, total_price)
SELECT
  (SELECT id FROM sales WHERE notes LIKE '%15 reclamações%'),
  (SELECT id FROM services WHERE name = 'Vendas com Reclamações'),
  15,
  31.67, -- Preço médio: 475 / 15 = 31.67
  475.00
FROM generate_series(1, 1);

-- ============================================================================
-- EXEMPLO 2: Venda com exatamente 20 reclamações
-- ============================================================================
-- Cálculo esperado:
-- - 10 primeiras: 10 × R$ 40,00 = R$ 400,00
-- - 10 seguintes: 10 × R$ 15,00 = R$ 150,00
-- - TOTAL:                        = R$ 550,00
-- ============================================================================

INSERT INTO clients (name, email, phone, cpf_cnpj)
VALUES ('Cliente Teste 2', 'teste2@example.com', '11999999002', '12345678902');

INSERT INTO sales (client_id, total_amount, payment_method, notes)
VALUES (
  (SELECT id FROM clients WHERE email = 'teste2@example.com'),
  550.00,
  'dinheiro',
  'Venda com 20 reclamações - Teste de cálculo escalonado'
);

INSERT INTO sale_items (sale_id, service_id, quantity, unit_price, total_price)
SELECT
  (SELECT id FROM sales WHERE notes LIKE '%20 reclamações%'),
  (SELECT id FROM services WHERE name = 'Vendas com Reclamações'),
  20,
  27.50, -- Preço médio: 550 / 20 = 27.50
  550.00
FROM generate_series(1, 1);

-- ============================================================================
-- EXEMPLO 3: Venda com exatamente 12 reclamações
-- ============================================================================
-- Cálculo esperado:
-- - 10 primeiras: 10 × R$ 40,00 = R$ 400,00
-- - 2 seguintes:   2 × R$ 15,00 = R$  30,00
-- - TOTAL:                        = R$ 430,00
-- ============================================================================

INSERT INTO clients (name, email, phone, cpf_cnpj)
VALUES ('Cliente Teste 3', 'teste3@example.com', '11999999003', '12345678903');

INSERT INTO sales (client_id, total_amount, payment_method, notes)
VALUES (
  (SELECT id FROM clients WHERE email = 'teste3@example.com'),
  430.00,
  'credito',
  'Venda com 12 reclamações - Teste de cálculo escalonado'
);

INSERT INTO sale_items (sale_id, service_id, quantity, unit_price, total_price)
SELECT
  (SELECT id FROM sales WHERE notes LIKE '%12 reclamações%'),
  (SELECT id FROM services WHERE name = 'Vendas com Reclamações'),
  12,
  35.83, -- Preço médio: 430 / 12 = 35.83
  430.00
FROM generate_series(1, 1);

-- ============================================================================
-- EXEMPLO 4: Venda com exatamente 25 reclamações
-- ============================================================================
-- Cálculo esperado:
-- - 10 primeiras: 10 × R$ 40,00 = R$ 400,00
-- - 15 seguintes: 15 × R$ 15,00 = R$ 225,00
-- - TOTAL:                        = R$ 625,00
-- ============================================================================

INSERT INTO clients (name, email, phone, cpf_cnpj)
VALUES ('Cliente Teste 4', 'teste4@example.com', '11999999004', '12345678904');

INSERT INTO sales (client_id, total_amount, payment_method, notes)
VALUES (
  (SELECT id FROM clients WHERE email = 'teste4@example.com'),
  625.00,
  'debito',
  'Venda com 25 reclamações - Teste de cálculo escalonado'
);

INSERT INTO sale_items (sale_id, service_id, quantity, unit_price, total_price)
SELECT
  (SELECT id FROM sales WHERE notes LIKE '%25 reclamações%'),
  (SELECT id FROM services WHERE name = 'Vendas com Reclamações'),
  25,
  25.00, -- Preço médio: 625 / 25 = 25.00
  625.00
FROM generate_series(1, 1);

-- ============================================================================
-- VERIFICAÇÃO DOS DADOS INSERIDOS
-- ============================================================================

SELECT
  c.name AS cliente,
  s.id AS venda_id,
  si.quantity AS quantidade_reclamacoes,
  s.total_amount AS valor_total,
  s.payment_method AS forma_pagamento,
  s.notes AS observacoes
FROM sales s
JOIN clients c ON s.client_id = c.id
JOIN sale_items si ON si.sale_id = s.id
WHERE c.name LIKE 'Cliente Teste%'
ORDER BY si.quantity;

-- ============================================================================
-- RESUMO DOS EXEMPLOS CRIADOS
-- ============================================================================
-- Cliente Teste 1: 15 reclamações → R$ 475,00 (10×40 + 5×15)
-- Cliente Teste 2: 20 reclamações → R$ 550,00 (10×40 + 10×15)
-- Cliente Teste 3: 12 reclamações → R$ 430,00 (10×40 + 2×15)
-- Cliente Teste 4: 25 reclamações → R$ 625,00 (10×40 + 15×15)
-- ============================================================================
