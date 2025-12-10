-- Adiciona colunas de comissão e desconto na tabela sales se não existirem
ALTER TABLE sales ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_discount DECIMAL(10, 2) DEFAULT 0;

-- Atualiza as colunas com base nos dados existentes (opcional, mas bom para consistência)
-- UPDATE sales SET total_discount = (subtotal - total) WHERE total_discount = 0;
