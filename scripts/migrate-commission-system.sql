-- ============================================================================
-- MIGRAÇÃO: Sistema de Comissões
-- ============================================================================
-- Este script ALTERA as tabelas existentes ao invés de criar do zero
-- ============================================================================

-- ============================================================================
-- 1. TABELA DE FERIADOS (criar se não existir)
-- ============================================================================
CREATE TABLE IF NOT EXISTS holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    is_national BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
CREATE INDEX IF NOT EXISTS idx_holidays_active ON holidays(is_active);

-- ============================================================================
-- 2. ALTERAR TABELA commission_policies EXISTENTE
-- ============================================================================

-- Adicionar nova coluna 'scope' se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'commission_policies' AND column_name = 'scope'
    ) THEN
        ALTER TABLE commission_policies
        ADD COLUMN scope VARCHAR(50) NOT NULL DEFAULT 'general'
        CHECK (scope IN ('general', 'product', 'user', 'user_product'));
    END IF;
END $$;

-- Adicionar coluna 'applies_to' se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'commission_policies' AND column_name = 'applies_to'
    ) THEN
        ALTER TABLE commission_policies
        ADD COLUMN applies_to VARCHAR(20) NOT NULL DEFAULT 'all'
        CHECK (applies_to IN ('all', 'weekdays', 'weekends_holidays'));
    END IF;
END $$;

-- Adicionar coluna 'valid_from' se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'commission_policies' AND column_name = 'valid_from'
    ) THEN
        ALTER TABLE commission_policies
        ADD COLUMN valid_from DATE NOT NULL DEFAULT CURRENT_DATE;
    END IF;
END $$;

-- Adicionar coluna 'valid_until' se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'commission_policies' AND column_name = 'valid_until'
    ) THEN
        ALTER TABLE commission_policies
        ADD COLUMN valid_until DATE;
    END IF;
END $$;

-- Adicionar coluna 'name' se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'commission_policies' AND column_name = 'name'
    ) THEN
        ALTER TABLE commission_policies
        ADD COLUMN name VARCHAR(200);
    END IF;
END $$;

-- Adicionar coluna 'description' se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'commission_policies' AND column_name = 'description'
    ) THEN
        ALTER TABLE commission_policies
        ADD COLUMN description TEXT;
    END IF;
END $$;

-- Adicionar coluna 'type' se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'commission_policies' AND column_name = 'type'
    ) THEN
        ALTER TABLE commission_policies
        ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'percentage'
        CHECK (type IN ('percentage', 'fixed_per_unit'));
    END IF;
END $$;

-- Adicionar coluna 'value' se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'commission_policies' AND column_name = 'value'
    ) THEN
        ALTER TABLE commission_policies
        ADD COLUMN value DECIMAL(10, 4) NOT NULL DEFAULT 0
        CHECK (value >= 0);
    END IF;
END $$;

-- Adicionar coluna 'consider_business_days' se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'commission_policies' AND column_name = 'consider_business_days'
    ) THEN
        ALTER TABLE commission_policies
        ADD COLUMN consider_business_days BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_commission_policies_scope ON commission_policies(scope);
CREATE INDEX IF NOT EXISTS idx_commission_policies_applies_to ON commission_policies(applies_to);
CREATE INDEX IF NOT EXISTS idx_commission_policies_valid_from ON commission_policies(valid_from);

-- ============================================================================
-- 3. ADICIONAR COLUNAS NA TABELA SALES
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sales' AND column_name = 'commission_amount'
    ) THEN
        ALTER TABLE sales ADD COLUMN commission_amount DECIMAL(10, 2) DEFAULT 0;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sales' AND column_name = 'commission_policy_id'
    ) THEN
        ALTER TABLE sales ADD COLUMN commission_policy_id UUID REFERENCES commission_policies(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sales' AND column_name = 'discount_amount'
    ) THEN
        ALTER TABLE sales ADD COLUMN discount_amount DECIMAL(10, 2) DEFAULT 0;
    END IF;
END $$;

-- ============================================================================
-- 4. FUNÇÃO: Verificar se uma data é fim de semana ou feriado
-- ============================================================================
CREATE OR REPLACE FUNCTION is_weekend_or_holiday(check_date DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    -- Verifica se é sábado (6) ou domingo (0)
    IF EXTRACT(DOW FROM check_date) IN (0, 6) THEN
        RETURN TRUE;
    END IF;

    -- Verifica se é feriado ativo
    IF EXISTS (
        SELECT 1 FROM holidays
        WHERE date = check_date
        AND is_active = true
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

-- ============================================================================
-- 5. FUNÇÃO: Buscar política de comissão aplicável
-- ============================================================================
CREATE OR REPLACE FUNCTION get_applicable_commission_policy(
    p_user_id UUID,
    p_product_id UUID,
    p_sale_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_policy_id UUID;
    v_is_weekend_or_holiday BOOLEAN;
    v_day_type VARCHAR(20);
BEGIN
    -- Determinar tipo de dia
    v_is_weekend_or_holiday := is_weekend_or_holiday(p_sale_date);

    IF v_is_weekend_or_holiday THEN
        v_day_type := 'weekends_holidays';
    ELSE
        v_day_type := 'weekdays';
    END IF;

    -- Prioridade 1: user_product
    SELECT id INTO v_policy_id
    FROM commission_policies
    WHERE scope = 'user_product'
        AND user_id = p_user_id
        AND product_id = p_product_id
        AND is_active = true
        AND p_sale_date >= valid_from
        AND (valid_until IS NULL OR p_sale_date <= valid_until)
        AND (applies_to = 'all' OR applies_to = v_day_type)
    ORDER BY valid_from DESC
    LIMIT 1;

    IF v_policy_id IS NOT NULL THEN
        RETURN v_policy_id;
    END IF;

    -- Prioridade 2: user
    SELECT id INTO v_policy_id
    FROM commission_policies
    WHERE scope = 'user'
        AND user_id = p_user_id
        AND is_active = true
        AND p_sale_date >= valid_from
        AND (valid_until IS NULL OR p_sale_date <= valid_until)
        AND (applies_to = 'all' OR applies_to = v_day_type)
    ORDER BY valid_from DESC
    LIMIT 1;

    IF v_policy_id IS NOT NULL THEN
        RETURN v_policy_id;
    END IF;

    -- Prioridade 3: product
    SELECT id INTO v_policy_id
    FROM commission_policies
    WHERE scope = 'product'
        AND product_id = p_product_id
        AND is_active = true
        AND p_sale_date >= valid_from
        AND (valid_until IS NULL OR p_sale_date <= valid_until)
        AND (applies_to = 'all' OR applies_to = v_day_type)
    ORDER BY valid_from DESC
    LIMIT 1;

    IF v_policy_id IS NOT NULL THEN
        RETURN v_policy_id;
    END IF;

    -- Prioridade 4: general
    SELECT id INTO v_policy_id
    FROM commission_policies
    WHERE scope = 'general'
        AND is_active = true
        AND p_sale_date >= valid_from
        AND (valid_until IS NULL OR p_sale_date <= valid_until)
        AND (applies_to = 'all' OR applies_to = v_day_type)
    ORDER BY valid_from DESC
    LIMIT 1;

    RETURN v_policy_id;
END;
$$;

-- ============================================================================
-- 6. FUNÇÃO: Calcular comissão
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_commission(
    p_sale_id UUID,
    p_net_amount DECIMAL(10, 2),
    p_policy_id UUID
)
RETURNS DECIMAL(10, 2)
LANGUAGE plpgsql
AS $$
DECLARE
    v_policy RECORD;
    v_commission DECIMAL(10, 2);
    v_quantity INTEGER;
BEGIN
    -- Buscar política
    SELECT * INTO v_policy
    FROM commission_policies
    WHERE id = p_policy_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Calcular comissão baseado no tipo
    IF v_policy.type = 'percentage' THEN
        v_commission := p_net_amount * (v_policy.value / 100);
    ELSIF v_policy.type = 'fixed_per_unit' THEN
        -- Somar quantidade de todos os itens da venda
        SELECT COALESCE(SUM(quantity), 0) INTO v_quantity
        FROM sale_items
        WHERE sale_id = p_sale_id;

        v_commission := v_quantity * v_policy.value;
    ELSE
        v_commission := 0;
    END IF;

    RETURN ROUND(v_commission, 2);
END;
$$;

-- ============================================================================
-- 7. LIMPAR POLÍTICAS ANTIGAS E INSERIR NOVAS
-- ============================================================================

-- Desativar políticas antigas (não deletar para manter histórico)
UPDATE commission_policies SET is_active = false WHERE scope = 'general';

-- Inserir políticas padrão
INSERT INTO commission_policies (
    name,
    description,
    type,
    value,
    scope,
    applies_to,
    is_active
) VALUES
(
    'Comissão Padrão - Dias Úteis',
    'Comissão de 3,5% sobre vendas em dias úteis (seg-sex)',
    'percentage',
    3.5,
    'general',
    'weekdays',
    true
),
(
    'Comissão Especial - Fins de Semana e Feriados',
    'Comissão de 10% sobre vendas em fins de semana e feriados',
    'percentage',
    10.0,
    'general',
    'weekends_holidays',
    true
);

-- ============================================================================
-- 8. INSERIR FERIADOS NACIONAIS DE 2025
-- ============================================================================
INSERT INTO holidays (date, name, is_national) VALUES
    ('2025-01-01', 'Ano Novo', true),
    ('2025-02-24', 'Carnaval', true),
    ('2025-02-25', 'Carnaval', true),
    ('2025-04-18', 'Sexta-feira Santa', true),
    ('2025-04-21', 'Tiradentes', true),
    ('2025-05-01', 'Dia do Trabalho', true),
    ('2025-06-19', 'Corpus Christi', true),
    ('2025-09-07', 'Independência do Brasil', true),
    ('2025-10-12', 'Nossa Senhora Aparecida', true),
    ('2025-11-02', 'Finados', true),
    ('2025-11-15', 'Proclamação da República', true),
    ('2025-11-20', 'Dia da Consciência Negra', true),
    ('2025-12-25', 'Natal', true)
ON CONFLICT (date) DO NOTHING;

-- ============================================================================
-- 9. TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_commission_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_commission_policies_updated_at ON commission_policies;
CREATE TRIGGER trigger_update_commission_policies_updated_at
    BEFORE UPDATE ON commission_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_commission_policies_updated_at();

DROP TRIGGER IF EXISTS trigger_update_holidays_updated_at ON holidays;
CREATE TRIGGER trigger_update_holidays_updated_at
    BEFORE UPDATE ON holidays
    FOR EACH ROW
    EXECUTE FUNCTION update_commission_policies_updated_at();

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
SELECT 'Sistema de comissões migrado com sucesso!' as message;

SELECT 'Políticas ativas:' as info, COUNT(*) as total
FROM commission_policies WHERE is_active = true;

SELECT 'Feriados cadastrados:' as info, COUNT(*) as total FROM holidays;
