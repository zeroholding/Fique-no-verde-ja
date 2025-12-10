-- ============================================================================
-- SISTEMA DE COMISSÕES
-- ============================================================================
-- Regras:
-- - Dias úteis (seg-sex): 2,5% sobre valor líquido (total - descontos)
-- - Fins de semana + feriados: 10% sobre valor líquido
-- - Prioridade: (usuário+produto) > (usuário) > (produto) > (geral)
-- ============================================================================

-- ============================================================================
-- 1. TABELA DE FERIADOS
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

COMMENT ON TABLE holidays IS 'Cadastro de feriados nacionais e locais';
COMMENT ON COLUMN holidays.is_national IS 'true = feriado nacional, false = feriado local';

-- ============================================================================
-- 2. TABELA DE POLÍTICAS DE COMISSÃO
-- ============================================================================
CREATE TABLE IF NOT EXISTS commission_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,

    -- Tipo de comissão
    type VARCHAR(20) NOT NULL CHECK (type IN ('percentage', 'fixed_per_unit')),
    value DECIMAL(10, 4) NOT NULL CHECK (value >= 0),

    -- Escopo (define a prioridade)
    scope VARCHAR(50) NOT NULL CHECK (scope IN ('general', 'product', 'user', 'user_product')),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Aplicação por tipo de dia
    applies_to VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'weekdays', 'weekends_holidays')),

    -- Considera dias úteis
    consider_business_days BOOLEAN DEFAULT false,

    -- Vigência
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Auditoria
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Constraints
    CONSTRAINT check_product_scope CHECK (
        (scope IN ('product', 'user_product') AND product_id IS NOT NULL) OR
        (scope NOT IN ('product', 'user_product') AND product_id IS NULL)
    ),
    CONSTRAINT check_user_scope CHECK (
        (scope IN ('user', 'user_product') AND user_id IS NOT NULL) OR
        (scope NOT IN ('user', 'user_product') AND user_id IS NULL)
    ),
    CONSTRAINT check_valid_dates CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_commission_policies_scope ON commission_policies(scope);
CREATE INDEX IF NOT EXISTS idx_commission_policies_product ON commission_policies(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commission_policies_user ON commission_policies(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commission_policies_active ON commission_policies(is_active);
CREATE INDEX IF NOT EXISTS idx_commission_policies_valid_from ON commission_policies(valid_from);

COMMENT ON TABLE commission_policies IS 'Políticas de comissão com diferentes escopos e prioridades';
COMMENT ON COLUMN commission_policies.type IS 'percentage = percentual sobre venda, fixed_per_unit = valor fixo por unidade';
COMMENT ON COLUMN commission_policies.scope IS 'Define a prioridade: user_product > user > product > general';
COMMENT ON COLUMN commission_policies.applies_to IS 'all = todos os dias, weekdays = dias úteis, weekends_holidays = fins de semana e feriados';

-- ============================================================================
-- 3. ADICIONAR COLUNA DE COMISSÃO NA TABELA SALES
-- ============================================================================
ALTER TABLE sales ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS commission_policy_id UUID REFERENCES commission_policies(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) DEFAULT 0;

COMMENT ON COLUMN sales.commission_amount IS 'Valor da comissão calculada para esta venda';
COMMENT ON COLUMN sales.commission_policy_id IS 'Política de comissão aplicada';
COMMENT ON COLUMN sales.discount_amount IS 'Valor total de desconto dado na venda';

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

COMMENT ON FUNCTION is_weekend_or_holiday IS 'Retorna TRUE se a data é fim de semana ou feriado';

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

COMMENT ON FUNCTION get_applicable_commission_policy IS 'Busca a política de comissão aplicável seguindo a prioridade: user_product > user > product > general';

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

COMMENT ON FUNCTION calculate_commission IS 'Calcula a comissão baseado na política e valor líquido da venda';

-- ============================================================================
-- 7. INSERIR POLÍTICAS PADRÃO
-- ============================================================================

-- Política geral para dias úteis (2,5%)
INSERT INTO commission_policies (
    name,
    description,
    type,
    value,
    scope,
    applies_to,
    is_active
) VALUES (
    'Comissão Padrão - Dias Úteis',
    'Comissão de 3,5% sobre vendas em dias úteis (seg-sex)',
    'percentage',
    3.5,
    'general',
    'weekdays',
    true
) ON CONFLICT DO NOTHING;

-- Política geral para fins de semana e feriados (10%)
INSERT INTO commission_policies (
    name,
    description,
    type,
    value,
    scope,
    applies_to,
    is_active
) VALUES (
    'Comissão Especial - Fins de Semana e Feriados',
    'Comissão de 10% sobre vendas em fins de semana e feriados',
    'percentage',
    10.0,
    'general',
    'weekends_holidays',
    true
) ON CONFLICT DO NOTHING;

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
-- 9. TRIGGER: Atualizar updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_commission_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_commission_policies_updated_at
    BEFORE UPDATE ON commission_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_commission_policies_updated_at();

CREATE TRIGGER trigger_update_holidays_updated_at
    BEFORE UPDATE ON holidays
    FOR EACH ROW
    EXECUTE FUNCTION update_commission_policies_updated_at();

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
SELECT 'Sistema de comissões criado com sucesso!' as message;

SELECT 'Políticas cadastradas:' as info, COUNT(*) as total FROM commission_policies;
SELECT 'Feriados cadastrados:' as info, COUNT(*) as total FROM holidays;
