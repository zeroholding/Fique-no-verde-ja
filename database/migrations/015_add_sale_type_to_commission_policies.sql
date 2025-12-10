-- Migration: Adiciona suporte a sale_type nas politicas de comissao
-- Objetivo:
--   - Permitir politicas especificas por tipo de venda (01, 02, 03)
--   - Configurar politica default para o tipo 03 (consumo de pacote) com valor fixo por unidade

-- 1) Adicionar coluna sale_type com default abrangente
ALTER TABLE commission_policies
ADD COLUMN IF NOT EXISTS sale_type VARCHAR(3) NOT NULL DEFAULT 'all'
    CHECK (sale_type IN ('01', '02', '03', 'all'));

COMMENT ON COLUMN commission_policies.sale_type IS 'Tipo de venda ao qual a politica se aplica (01,02,03 ou all)';

-- Garantir que registros antigos continuem validos
UPDATE commission_policies SET sale_type = 'all' WHERE sale_type IS NULL;

-- 2) Recriar funcao get_applicable_commission_policy com filtro por sale_type
--    (removendo a versao antiga com 3 parametros para evitar conflito de overload)
DROP FUNCTION IF EXISTS get_applicable_commission_policy(UUID, UUID, DATE);

CREATE OR REPLACE FUNCTION get_applicable_commission_policy(
    p_user_id UUID,
    p_product_id UUID,
    p_sale_date DATE,
    p_sale_type VARCHAR(3)
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
    v_is_weekend_or_holiday := (
        EXTRACT(DOW FROM p_sale_date) IN (0,6) OR
        EXISTS (SELECT 1 FROM holidays WHERE date = p_sale_date AND is_active = true)
    );

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
      AND (sale_type = 'all' OR sale_type = p_sale_type)
      AND p_sale_date >= valid_from
      AND (valid_until IS NULL OR p_sale_date <= valid_until)
      AND (applies_to = 'all' OR applies_to = v_day_type)
    ORDER BY (sale_type = p_sale_type) DESC, valid_from DESC
    LIMIT 1;
    IF v_policy_id IS NOT NULL THEN RETURN v_policy_id; END IF;

    -- Prioridade 2: user
    SELECT id INTO v_policy_id
    FROM commission_policies
    WHERE scope = 'user'
      AND user_id = p_user_id
      AND is_active = true
      AND (sale_type = 'all' OR sale_type = p_sale_type)
      AND p_sale_date >= valid_from
      AND (valid_until IS NULL OR p_sale_date <= valid_until)
      AND (applies_to = 'all' OR applies_to = v_day_type)
    ORDER BY (sale_type = p_sale_type) DESC, valid_from DESC
    LIMIT 1;
    IF v_policy_id IS NOT NULL THEN RETURN v_policy_id; END IF;

    -- Prioridade 3: product
    SELECT id INTO v_policy_id
    FROM commission_policies
    WHERE scope = 'product'
      AND product_id = p_product_id
      AND is_active = true
      AND (sale_type = 'all' OR sale_type = p_sale_type)
      AND p_sale_date >= valid_from
      AND (valid_until IS NULL OR p_sale_date <= valid_until)
      AND (applies_to = 'all' OR applies_to = v_day_type)
    ORDER BY (sale_type = p_sale_type) DESC, valid_from DESC
    LIMIT 1;
    IF v_policy_id IS NOT NULL THEN RETURN v_policy_id; END IF;

    -- Prioridade 4: general
    SELECT id INTO v_policy_id
    FROM commission_policies
    WHERE scope = 'general'
      AND is_active = true
      AND (sale_type = 'all' OR sale_type = p_sale_type)
      AND p_sale_date >= valid_from
      AND (valid_until IS NULL OR p_sale_date <= valid_until)
      AND (applies_to = 'all' OR applies_to = v_day_type)
    ORDER BY (sale_type = p_sale_type) DESC, valid_from DESC
    LIMIT 1;

    RETURN v_policy_id;
END;
$$;

COMMENT ON FUNCTION get_applicable_commission_policy IS 'Busca politica de comissao considerando tipo de venda, escopo e data';

-- 3) Criar politica default para consumo de pacote (tipo 03)
INSERT INTO commission_policies (
    name,
    description,
    type,
    value,
    scope,
    sale_type,
    applies_to,
    consider_business_days,
    valid_from,
    is_active
)
SELECT
    'Comissao Consumo de Pacote (R$0,25/un)',
    'Politica geral fixa por unidade para vendas tipo 03 (consumo de pacote)',
    'fixed_per_unit',
    0.25,
    'general',
    '03',
    'all',
    false,
    CURRENT_DATE,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM commission_policies
    WHERE scope = 'general'
      AND sale_type = '03'
      AND type = 'fixed_per_unit'
);
