-- ============================================================================
-- SEED: Vendas com Reclamações para Testar Cálculo Escalonado
-- ============================================================================
-- Fórmula de cálculo:
-- - Se quantidade ≤ 10: valor = quantidade × R$ 40,00
-- - Se quantidade > 10: valor = (quantidade - 10) × R$ 15,00 + R$ 400,00
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

DELETE FROM price_ranges WHERE product_id IN (
  SELECT id FROM products WHERE name = 'Vendas com Reclamações'
);

DELETE FROM products WHERE name = 'Vendas com Reclamações';

-- ============================================================================
-- 1. CRIAR O PRODUTO "Vendas com Reclamações"
-- ============================================================================

INSERT INTO products (name, description, sku, is_active)
VALUES (
  'Vendas com Reclamações',
  'Serviço de tratamento de reclamações com preço escalonado',
  'SVC-COMPLAINTS',
  true
);

-- ============================================================================
-- 2. CRIAR AS FAIXAS DE PREÇO
-- ============================================================================

INSERT INTO price_ranges (product_id, min_quantity, max_quantity, unit_price, is_active)
VALUES
  (
    (SELECT id FROM products WHERE name = 'Vendas com Reclamações'),
    1,
    10,
    40.00,
    true
  ),
  (
    (SELECT id FROM products WHERE name = 'Vendas com Reclamações'),
    11,
    NULL,
    15.00,
    true
  );

-- ============================================================================
-- EXEMPLO 1: Venda com exatamente 15 reclamações
-- ============================================================================
-- Cálculo: (15 - 10) × 15 + 400 = 5 × 15 + 400 = 75 + 400 = R$ 475,00
-- ============================================================================

INSERT INTO clients (name, email, phone, cpf_cnpj)
VALUES ('Cliente Teste 1', 'teste1@example.com', '11999999001', '12345678901');

INSERT INTO sales (client_id, attendant_id, subtotal, total, payment_method, observations)
VALUES (
  (SELECT id FROM clients WHERE email = 'teste1@example.com'),
  (SELECT id FROM users LIMIT 1),
  475.00,
  475.00,
  'pix',
  'Venda com 15 reclamações - Teste de cálculo escalonado'
);

INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal, total)
VALUES (
  (SELECT id FROM sales WHERE observations LIKE '%15 reclamações%'),
  (SELECT id FROM products WHERE name = 'Vendas com Reclamações'),
  'Vendas com Reclamações',
  15,
  31.67, -- Preço médio: 475 / 15 = 31.67
  475.00,
  475.00
);

-- ============================================================================
-- EXEMPLO 2: Venda com exatamente 20 reclamações
-- ============================================================================
-- Cálculo: (20 - 10) × 15 + 400 = 10 × 15 + 400 = 150 + 400 = R$ 550,00
-- ============================================================================

INSERT INTO clients (name, email, phone, cpf_cnpj)
VALUES ('Cliente Teste 2', 'teste2@example.com', '11999999002', '12345678902');

INSERT INTO sales (client_id, attendant_id, subtotal, total, payment_method, observations)
VALUES (
  (SELECT id FROM clients WHERE email = 'teste2@example.com'),
  (SELECT id FROM users LIMIT 1),
  550.00,
  550.00,
  'dinheiro',
  'Venda com 20 reclamações - Teste de cálculo escalonado'
);

INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal, total)
VALUES (
  (SELECT id FROM sales WHERE observations LIKE '%20 reclamações%'),
  (SELECT id FROM products WHERE name = 'Vendas com Reclamações'),
  'Vendas com Reclamações',
  20,
  27.50, -- Preço médio: 550 / 20 = 27.50
  550.00,
  550.00
);

-- ============================================================================
-- EXEMPLO 3: Venda com exatamente 12 reclamações
-- ============================================================================
-- Cálculo: (12 - 10) × 15 + 400 = 2 × 15 + 400 = 30 + 400 = R$ 430,00
-- ============================================================================

INSERT INTO clients (name, email, phone, cpf_cnpj)
VALUES ('Cliente Teste 3', 'teste3@example.com', '11999999003', '12345678903');

INSERT INTO sales (client_id, attendant_id, subtotal, total, payment_method, observations)
VALUES (
  (SELECT id FROM clients WHERE email = 'teste3@example.com'),
  (SELECT id FROM users LIMIT 1),
  430.00,
  430.00,
  'cartao_credito',
  'Venda com 12 reclamações - Teste de cálculo escalonado'
);

INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal, total)
VALUES (
  (SELECT id FROM sales WHERE observations LIKE '%12 reclamações%'),
  (SELECT id FROM products WHERE name = 'Vendas com Reclamações'),
  'Vendas com Reclamações',
  12,
  35.83, -- Preço médio: 430 / 12 = 35.83
  430.00,
  430.00
);

-- ============================================================================
-- EXEMPLO 4: Venda com exatamente 25 reclamações
-- ============================================================================
-- Cálculo: (25 - 10) × 15 + 400 = 15 × 15 + 400 = 225 + 400 = R$ 625,00
-- ============================================================================

INSERT INTO clients (name, email, phone, cpf_cnpj)
VALUES ('Cliente Teste 4', 'teste4@example.com', '11999999004', '12345678904');

INSERT INTO sales (client_id, attendant_id, subtotal, total, payment_method, observations)
VALUES (
  (SELECT id FROM clients WHERE email = 'teste4@example.com'),
  (SELECT id FROM users LIMIT 1),
  625.00,
  625.00,
  'cartao_debito',
  'Venda com 25 reclamações - Teste de cálculo escalonado'
);

INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal, total)
VALUES (
  (SELECT id FROM sales WHERE observations LIKE '%25 reclamações%'),
  (SELECT id FROM products WHERE name = 'Vendas com Reclamações'),
  'Vendas com Reclamações',
  25,
  25.00, -- Preço médio: 625 / 25 = 25.00
  625.00,
  625.00
);

-- ============================================================================
-- VERIFICAÇÃO DOS DADOS INSERIDOS
-- ============================================================================

SELECT
  c.name AS cliente,
  s.id AS venda_id,
  si.quantity AS quantidade_reclamacoes,
  s.total AS valor_total,
  ROUND(s.total / si.quantity, 2) AS preco_medio_unitario,
  s.payment_method AS forma_pagamento,
  s.observations AS observacoes
FROM sales s
JOIN clients c ON s.client_id = c.id
JOIN sale_items si ON si.sale_id = s.id
WHERE c.name LIKE 'Cliente Teste%'
ORDER BY si.quantity;

-- ============================================================================
-- RESUMO DOS EXEMPLOS CRIADOS
-- ============================================================================
-- Cliente Teste 1: 15 reclamações → R$ 475,00 | Cálculo: (15-10)×15 + 400
-- Cliente Teste 2: 20 reclamações → R$ 550,00 | Cálculo: (20-10)×15 + 400
-- Cliente Teste 3: 12 reclamações → R$ 430,00 | Cálculo: (12-10)×15 + 400
-- Cliente Teste 4: 25 reclamações → R$ 625,00 | Cálculo: (25-10)×15 + 400
-- ============================================================================
