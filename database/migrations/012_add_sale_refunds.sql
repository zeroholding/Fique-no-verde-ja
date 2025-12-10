-- Add column to track total refunded value per sale
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS refund_total DECIMAL(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN sales.refund_total IS 'Soma de estornos financeiros aplicados na venda';

-- Table to register refund entries
CREATE TABLE IF NOT EXISTS sale_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    reason TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sale_refunds_sale ON sale_refunds(sale_id);
