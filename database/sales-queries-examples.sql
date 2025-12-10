-- =====================================================
-- QUERIES ÚTEIS E EXEMPLOS - SISTEMA DE VENDAS
-- =====================================================

-- =============================
-- 1. INSERIR PRODUTOS E FAIXAS DE PREÇO
-- =============================

-- Inserir um produto
INSERT INTO products (name, description, sku, is_active)
VALUES ('Camiseta Básica', 'Camiseta 100% algodão', 'CAM-BAS-001', true)
RETURNING id, name, sku;

-- Inserir faixas de preço para um produto (substitua o UUID pelo ID do produto)
INSERT INTO price_ranges (product_id, min_quantity, max_quantity, unit_price, valid_from)
VALUES
    ('SEU-PRODUTO-UUID-AQUI', 1, 10, 50.00, CURRENT_DATE),      -- 1-10 unidades: R$ 50,00
    ('SEU-PRODUTO-UUID-AQUI', 11, 50, 45.00, CURRENT_DATE),     -- 11-50 unidades: R$ 45,00
    ('SEU-PRODUTO-UUID-AQUI', 51, NULL, 40.00, CURRENT_DATE);   -- 51+ unidades: R$ 40,00

-- =============================
-- 2. BUSCAR PREÇO CORRETO POR QUANTIDADE
-- =============================

-- Função para buscar o preço unitário baseado na quantidade
SELECT
    pr.unit_price,
    pr.min_quantity,
    pr.max_quantity
FROM price_ranges pr
WHERE pr.product_id = 'SEU-PRODUTO-UUID-AQUI'
  AND pr.is_active = true
  AND pr.valid_from <= CURRENT_DATE
  AND (pr.valid_until IS NULL OR pr.valid_until >= CURRENT_DATE)
  AND pr.min_quantity <= 25  -- quantidade desejada
  AND (pr.max_quantity IS NULL OR pr.max_quantity >= 25)
ORDER BY pr.min_quantity DESC
LIMIT 1;

-- =============================
-- 3. CRIAR UMA VENDA
-- =============================

-- Passo 1: Criar a venda (status: aberta)
INSERT INTO sales (
    client_id,
    attendant_id,
    sale_date,
    observations,
    payment_method,
    status
) VALUES (
    'SEU-CLIENT-UUID-AQUI',
    'SEU-USER-UUID-AQUI',
    CURRENT_TIMESTAMP,
    'Venda de teste',
    'pix',
    'aberta'
) RETURNING id;

-- Passo 2: Adicionar itens à venda
INSERT INTO sale_items (
    sale_id,
    product_id,
    product_name,
    quantity,
    unit_price,
    discount_type,
    discount_value,
    subtotal,
    discount_amount,
    total
) VALUES (
    'SEU-SALE-UUID-AQUI',
    'SEU-PRODUTO-UUID-AQUI',
    'Camiseta Básica',
    20,
    45.00,  -- Preço da faixa para 20 unidades
    'percentage',
    10,  -- 10% de desconto
    900.00,  -- 20 × 45
    90.00,   -- 900 × 0.10
    810.00   -- 900 - 90
);

-- Passo 3: Atualizar totais da venda
UPDATE sales
SET
    subtotal = (SELECT SUM(subtotal) FROM sale_items WHERE sale_id = 'SEU-SALE-UUID-AQUI'),
    total_discount = (SELECT SUM(discount_amount) FROM sale_items WHERE sale_id = 'SEU-SALE-UUID-AQUI'),
    total = (SELECT SUM(total) FROM sale_items WHERE sale_id = 'SEU-SALE-UUID-AQUI')
WHERE id = 'SEU-SALE-UUID-AQUI';

-- =============================
-- 4. CONFIRMAR VENDA
-- =============================

-- Atualizar status da venda para confirmada
UPDATE sales
SET
    status = 'confirmada',
    confirmed_at = CURRENT_TIMESTAMP
WHERE id = 'SEU-SALE-UUID-AQUI'
  AND status = 'aberta';

-- Gerar comissões para a venda confirmada
INSERT INTO commissions (
    sale_id,
    sale_item_id,
    user_id,
    base_amount,
    commission_type,
    commission_rate,
    commission_amount,
    reference_date,
    status
)
SELECT
    si.sale_id,
    si.id,
    s.attendant_id,
    si.total,  -- Base líquida (após desconto do item)
    'percentage',
    5.00,  -- 5% de comissão
    si.total * 0.05,
    s.sale_date::DATE,
    'a_pagar'
FROM sale_items si
JOIN sales s ON si.sale_id = s.id
WHERE s.id = 'SEU-SALE-UUID-AQUI'
  AND s.status = 'confirmada';

-- =============================
-- 5. CANCELAR VENDA
-- =============================

-- Cancelar venda e estornar comissões
BEGIN;

-- Atualizar status da venda
UPDATE sales
SET
    status = 'cancelada',
    cancelled_at = CURRENT_TIMESTAMP
WHERE id = 'SEU-SALE-UUID-AQUI';

-- Cancelar comissões relacionadas
UPDATE commissions
SET
    status = 'cancelado',
    updated_at = CURRENT_TIMESTAMP
WHERE sale_id = 'SEU-SALE-UUID-AQUI'
  AND status = 'a_pagar';

COMMIT;

-- =============================
-- 6. CONSULTAS DE RELATÓRIOS
-- =============================

-- Vendas por período e status
SELECT
    DATE(sale_date) as data,
    status,
    COUNT(*) as total_vendas,
    SUM(total) as valor_total
FROM sales
WHERE sale_date BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY DATE(sale_date), status
ORDER BY data DESC, status;

-- Top vendedores do mês
SELECT
    u.first_name || ' ' || u.last_name as vendedor,
    COUNT(DISTINCT s.id) as total_vendas,
    SUM(s.total) as valor_total,
    AVG(s.total) as ticket_medio
FROM sales s
JOIN users u ON s.attendant_id = u.id
WHERE s.status = 'confirmada'
  AND s.sale_date >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY u.id, u.first_name, u.last_name
ORDER BY valor_total DESC
LIMIT 10;

-- Produtos mais vendidos
SELECT
    p.name as produto,
    COUNT(si.id) as qtd_vendas,
    SUM(si.quantity) as unidades_vendidas,
    SUM(si.total) as valor_total
FROM sale_items si
JOIN products p ON si.product_id = p.id
JOIN sales s ON si.sale_id = s.id
WHERE s.status = 'confirmada'
  AND s.sale_date >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY p.id, p.name
ORDER BY valor_total DESC
LIMIT 10;

-- Comissões a pagar por vendedor
SELECT
    u.first_name || ' ' || u.last_name as vendedor,
    COUNT(*) as qtd_comissoes,
    SUM(c.commission_amount) as total_a_pagar,
    MIN(c.reference_date) as primeira_venda,
    MAX(c.reference_date) as ultima_venda
FROM commissions c
JOIN users u ON c.user_id = u.id
WHERE c.status = 'a_pagar'
GROUP BY u.id, u.first_name, u.last_name
ORDER BY total_a_pagar DESC;

-- Detalhes de uma venda específica
SELECT
    s.id,
    s.sale_date,
    s.status,
    c.name as cliente,
    u.first_name || ' ' || u.last_name as vendedor,
    si.product_name as produto,
    si.quantity as quantidade,
    si.unit_price as preco_unitario,
    si.subtotal,
    si.discount_amount as desconto,
    si.total,
    s.payment_method as forma_pagamento
FROM sales s
JOIN clients c ON s.client_id = c.id
JOIN users u ON s.attendant_id = u.id
JOIN sale_items si ON s.id = si.sale_id
WHERE s.id = 'SEU-SALE-UUID-AQUI';

-- =============================
-- 7. APLICAR DESCONTO GERAL NA VENDA
-- =============================

-- Exemplo: aplicar 10% de desconto geral na venda
BEGIN;

-- Atualizar desconto geral
UPDATE sales
SET
    general_discount_type = 'percentage',
    general_discount_value = 10
WHERE id = 'SEU-SALE-UUID-AQUI'
  AND status = 'aberta';

-- Recalcular total com desconto geral
WITH totals AS (
    SELECT
        SUM(total) as subtotal_items
    FROM sale_items
    WHERE sale_id = 'SEU-SALE-UUID-AQUI'
)
UPDATE sales s
SET
    subtotal = t.subtotal_items,
    total_discount = (
        SELECT SUM(discount_amount) FROM sale_items WHERE sale_id = s.id
    ) + (t.subtotal_items * 0.10),  -- 10% de desconto geral
    total = t.subtotal_items - (t.subtotal_items * 0.10)
FROM totals t
WHERE s.id = 'SEU-SALE-UUID-AQUI';

COMMIT;

-- =============================
-- 8. LISTAR VENDAS DE UM ATENDENTE
-- =============================

SELECT
    s.id,
    s.sale_date,
    s.status,
    c.name as cliente,
    s.total,
    s.payment_method,
    (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as qtd_itens
FROM sales s
JOIN clients c ON s.client_id = c.id
WHERE s.attendant_id = 'SEU-USER-UUID-AQUI'
ORDER BY s.sale_date DESC
LIMIT 20;

-- =============================
-- 9. VERIFICAR VENDAS EDITÁVEIS
-- =============================

-- Vendas que podem ser editadas (status: aberta, do próprio usuário)
SELECT
    s.id,
    s.sale_date,
    c.name as cliente,
    s.total,
    s.status
FROM sales s
JOIN clients c ON s.client_id = c.id
WHERE s.attendant_id = 'SEU-USER-UUID-AQUI'
  AND s.status = 'aberta'
ORDER BY s.sale_date DESC;

-- =============================
-- 10. ESTATÍSTICAS GERAIS
-- =============================

-- Dashboard de vendas do mês
SELECT
    COUNT(CASE WHEN status = 'aberta' THEN 1 END) as vendas_abertas,
    COUNT(CASE WHEN status = 'confirmada' THEN 1 END) as vendas_confirmadas,
    COUNT(CASE WHEN status = 'cancelada' THEN 1 END) as vendas_canceladas,
    COUNT(*) as total_vendas,
    COALESCE(SUM(CASE WHEN status = 'confirmada' THEN total END), 0) as faturamento_confirmado,
    COALESCE(AVG(CASE WHEN status = 'confirmada' THEN total END), 0) as ticket_medio
FROM sales
WHERE sale_date >= DATE_TRUNC('month', CURRENT_DATE);

-- =====================================================
-- NOTAS IMPORTANTES:
-- =====================================================
--
-- 1. Sempre substitua 'SEU-UUID-AQUI' pelos IDs reais
-- 2. Use transações (BEGIN/COMMIT) para operações críticas
-- 3. Valide permissões antes de editar/cancelar vendas
-- 4. Mantenha histórico de todas as alterações
-- 5. Calcule comissões apenas após confirmação da venda
--
-- =====================================================
