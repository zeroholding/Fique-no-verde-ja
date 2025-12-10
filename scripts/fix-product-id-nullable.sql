-- ============================================================================
-- FIX: Tornar product_id NULLABLE na tabela sale_items
-- ============================================================================
-- Problema: A coluna product_id tem constraint NOT NULL, mas quando vendemos
-- serviços (não produtos), o product_id é null, causando erro.
--
-- Solução: Tornar product_id NULLABLE para permitir vendas de serviços
-- ============================================================================

-- 1. Remover a constraint NOT NULL da coluna product_id
ALTER TABLE sale_items
ALTER COLUMN product_id DROP NOT NULL;

-- 2. Verificar se a constraint foi removida
-- SELECT column_name, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'sale_items' AND column_name = 'product_id';

-- ============================================================================
-- NOTA: Após executar este script, a coluna product_id poderá ser NULL
-- Isso permite que serviços sejam vendidos sem precisar de um product_id
-- ============================================================================
