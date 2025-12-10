-- =====================================================
-- SISTEMA DE VENDAS - ESTRUTURA DE BANCO DE DADOS
-- PostgreSQL Schema para Registro de Vendas
-- =====================================================

-- =============================
-- 1. TABELA DE PRODUTOS
-- =============================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sku VARCHAR(100) UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_sku ON products(sku);

COMMENT ON TABLE products IS 'Cadastro de produtos disponíveis para venda';
COMMENT ON COLUMN products.sku IS 'Stock Keeping Unit - código único do produto';

-- =============================
-- 2. TABELA DE FAIXAS DE PREÇO
-- =============================
CREATE TABLE IF NOT EXISTS price_ranges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    min_quantity INTEGER NOT NULL,
    max_quantity INTEGER,
    unit_price DECIMAL(10, 2) NOT NULL,
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_quantity_range CHECK (max_quantity IS NULL OR max_quantity >= min_quantity),
    CONSTRAINT check_positive_price CHECK (unit_price > 0),
    CONSTRAINT check_valid_dates CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE INDEX idx_price_ranges_product ON price_ranges(product_id);
CREATE INDEX idx_price_ranges_active ON price_ranges(is_active);
CREATE INDEX idx_price_ranges_dates ON price_ranges(valid_from, valid_until);

COMMENT ON TABLE price_ranges IS 'Faixas de preço por quantidade para cada produto';
COMMENT ON COLUMN price_ranges.min_quantity IS 'Quantidade mínima para esta faixa de preço';
COMMENT ON COLUMN price_ranges.max_quantity IS 'Quantidade máxima (NULL = sem limite)';
COMMENT ON COLUMN price_ranges.unit_price IS 'Preço unitário para esta faixa';

-- =============================
-- 3. TABELA DE VENDAS
-- =============================
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    attendant_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sale_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observations TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'confirmada', 'cancelada')),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'dinheiro' CHECK (payment_method IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto')),

    -- Desconto geral da venda
    general_discount_type VARCHAR(20) CHECK (general_discount_type IN ('percentage', 'fixed')),
    general_discount_value DECIMAL(10, 2) DEFAULT 0,

    -- Totais
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_discount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL DEFAULT 0,

    -- Datas de controle
    confirmed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_positive_subtotal CHECK (subtotal >= 0),
    CONSTRAINT check_positive_discount CHECK (general_discount_value >= 0),
    CONSTRAINT check_positive_total CHECK (total >= 0)
);

CREATE INDEX idx_sales_client ON sales(client_id);
CREATE INDEX idx_sales_attendant ON sales(attendant_id);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sales_payment ON sales(payment_method);

COMMENT ON TABLE sales IS 'Registro de vendas realizadas';
COMMENT ON COLUMN sales.status IS 'Status da venda: aberta (editável), confirmada (congelada), cancelada (estornada)';
COMMENT ON COLUMN sales.general_discount_type IS 'Tipo do desconto geral: percentage ou fixed';
COMMENT ON COLUMN sales.general_discount_value IS 'Valor do desconto geral (% ou R$)';

-- =============================
-- 4. TABELA DE ITENS DA VENDA
-- =============================
CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name VARCHAR(255) NOT NULL, -- Congelado no momento da venda
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL, -- Preço da faixa no momento da venda

    -- Desconto do item
    discount_type VARCHAR(20) CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value DECIMAL(10, 2) DEFAULT 0,

    -- Valores calculados
    subtotal DECIMAL(10, 2) NOT NULL, -- quantity * unit_price
    discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0, -- Desconto calculado
    total DECIMAL(10, 2) NOT NULL, -- subtotal - discount_amount

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_positive_quantity CHECK (quantity > 0),
    CONSTRAINT check_positive_unit_price CHECK (unit_price > 0),
    CONSTRAINT check_positive_discount CHECK (discount_value >= 0),
    CONSTRAINT check_positive_subtotal CHECK (subtotal >= 0),
    CONSTRAINT check_positive_total CHECK (total >= 0)
);

CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

COMMENT ON TABLE sale_items IS 'Itens individuais de cada venda';
COMMENT ON COLUMN sale_items.product_name IS 'Nome do produto congelado no momento da venda';
COMMENT ON COLUMN sale_items.unit_price IS 'Preço unitário congelado da faixa vigente';

-- =============================
-- 5. TABELA DE POLÍTICAS DE COMISSÃO
-- =============================
CREATE TABLE IF NOT EXISTS commission_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Tipo de comissão
    type VARCHAR(20) NOT NULL CHECK (type IN ('percentage', 'fixed')),
    value DECIMAL(10, 2) NOT NULL,

    -- Base de cálculo
    base VARCHAR(20) NOT NULL DEFAULT 'net' CHECK (base IN ('net', 'gross')),

    -- Vigência
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_positive_value CHECK (value > 0),
    CONSTRAINT check_valid_dates CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE INDEX idx_commission_policies_product ON commission_policies(product_id);
CREATE INDEX idx_commission_policies_user ON commission_policies(user_id);
CREATE INDEX idx_commission_policies_dates ON commission_policies(valid_from, valid_until);

COMMENT ON TABLE commission_policies IS 'Políticas de comissão por produto e/ou vendedor';
COMMENT ON COLUMN commission_policies.type IS 'Tipo: percentage (%) ou fixed (R$ por unidade)';
COMMENT ON COLUMN commission_policies.base IS 'Base: net (valor líquido) ou gross (valor bruto)';

-- =============================
-- 6. TABELA DE COMISSÕES
-- =============================
CREATE TABLE IF NOT EXISTS commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    sale_item_id UUID REFERENCES sale_items(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    -- Valores
    base_amount DECIMAL(10, 2) NOT NULL, -- Valor base para cálculo
    commission_type VARCHAR(20) NOT NULL CHECK (commission_type IN ('percentage', 'fixed')),
    commission_rate DECIMAL(10, 2) NOT NULL, -- Taxa ou valor fixo
    commission_amount DECIMAL(10, 2) NOT NULL, -- Valor da comissão calculado

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'a_pagar' CHECK (status IN ('a_pagar', 'pago', 'cancelado')),

    -- Datas
    reference_date DATE NOT NULL, -- Data da venda
    payment_date DATE, -- Data do pagamento
    considers_business_days BOOLEAN DEFAULT true,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_positive_base CHECK (base_amount >= 0),
    CONSTRAINT check_positive_rate CHECK (commission_rate >= 0),
    CONSTRAINT check_positive_amount CHECK (commission_amount >= 0)
);

CREATE INDEX idx_commissions_sale ON commissions(sale_id);
CREATE INDEX idx_commissions_user ON commissions(user_id);
CREATE INDEX idx_commissions_status ON commissions(status);
CREATE INDEX idx_commissions_reference_date ON commissions(reference_date);
CREATE INDEX idx_commissions_payment_date ON commissions(payment_date);

COMMENT ON TABLE commissions IS 'Comissões geradas a partir das vendas confirmadas';
COMMENT ON COLUMN commissions.base_amount IS 'Valor base usado no cálculo da comissão';
COMMENT ON COLUMN commissions.status IS 'Status: a_pagar, pago ou cancelado';
COMMENT ON COLUMN commissions.reference_date IS 'Data de referência (data da venda)';

-- =============================
-- 7. FUNÇÕES E TRIGGERS
-- =============================

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_price_ranges_updated_at BEFORE UPDATE ON price_ranges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sale_items_updated_at BEFORE UPDATE ON sale_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_commission_policies_updated_at BEFORE UPDATE ON commission_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_commissions_updated_at BEFORE UPDATE ON commissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================
-- 8. DADOS DE EXEMPLO (OPCIONAL)
-- =============================

-- Inserir produtos de exemplo
INSERT INTO products (name, description, sku, is_active) VALUES
('Produto A', 'Descrição do Produto A', 'PROD-A-001', true),
('Produto B', 'Descrição do Produto B', 'PROD-B-002', true),
('Produto C', 'Descrição do Produto C', 'PROD-C-003', true)
ON CONFLICT (sku) DO NOTHING;

-- Inserir faixas de preço de exemplo
-- Assumindo que já existem produtos com IDs específicos
-- Ajuste os UUIDs conforme necessário após inserir os produtos

-- Exemplo: Produto A
-- 1-10 unidades: R$ 100,00
-- 11-50 unidades: R$ 90,00
-- 51+ unidades: R$ 80,00

-- =============================
-- 9. VIEWS ÚTEIS
-- =============================

-- View de vendas com informações completas
CREATE OR REPLACE VIEW v_sales_details AS
SELECT
    s.id,
    s.sale_date,
    s.status,
    s.payment_method,
    c.name as client_name,
    u.first_name || ' ' || u.last_name as attendant_name,
    s.subtotal,
    s.total_discount,
    s.total,
    s.observations,
    s.created_at,
    s.updated_at
FROM sales s
JOIN clients c ON s.client_id = c.id
JOIN users u ON s.attendant_id = u.id;

COMMENT ON VIEW v_sales_details IS 'View com informações completas das vendas';

-- View de comissões pendentes
CREATE OR REPLACE VIEW v_commissions_pending AS
SELECT
    c.id,
    c.reference_date,
    u.first_name || ' ' || u.last_name as user_name,
    u.email as user_email,
    s.id as sale_id,
    cl.name as client_name,
    c.commission_amount,
    c.status,
    c.created_at
FROM commissions c
JOIN users u ON c.user_id = u.id
JOIN sales s ON c.sale_id = s.id
JOIN clients cl ON s.client_id = cl.id
WHERE c.status = 'a_pagar'
ORDER BY c.reference_date DESC;

COMMENT ON VIEW v_commissions_pending IS 'View com comissões pendentes de pagamento';

-- =============================
-- 10. GRANTS (PERMISSÕES)
-- =============================

-- Ajuste conforme seu usuário do PostgreSQL
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO seu_usuario;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO seu_usuario;

-- =====================================================
-- FIM DO SCRIPT
-- =====================================================

-- Para executar este script no pgAdmin:
-- 1. Abra o pgAdmin
-- 2. Conecte-se ao seu banco de dados
-- 3. Clique com botão direito no banco de dados
-- 4. Selecione "Query Tool"
-- 5. Cole este script completo
-- 6. Execute (F5 ou botão Play)
