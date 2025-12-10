-- Migration: Adicionar campo sale_type na tabela sale_items
-- Data: 2025-11-10
-- Descrição: Adiciona o campo sale_type para armazenar o tipo de venda ('01' - Comum ou '02' - Pacote) de cada item

-- Adicionar a coluna sale_type
ALTER TABLE sale_items
ADD COLUMN IF NOT EXISTS sale_type VARCHAR(2) NOT NULL DEFAULT '01'
CHECK (sale_type IN ('01', '02'));

-- Adicionar comentário
COMMENT ON COLUMN sale_items.sale_type IS 'Tipo de venda: 01 - Comum, 02 - Pacote';

-- Criar índice para facilitar consultas por tipo de venda
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_type ON sale_items(sale_type);
