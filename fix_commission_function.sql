-- Script para corrigir a função de cálculo de comissão
-- Isso resolve o problema de incompatibilidade (erro interno que zera a comissão)

-- 1. Primeiro removemos a versão antiga que tinha apenas 3 parâmetros (se existir)
DROP FUNCTION IF EXISTS get_applicable_commission_policy(UUID, UUID, DATE);

-- 2. Recriamos a função aceitando 4 parâmetros (incluindo p_sale_type)
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
    -- Determinar se é fim de semana ou feriado (para regras específicas)
    v_is_weekend_or_holiday := (
        EXTRACT(DOW FROM p_sale_date) IN (0,6) OR
        EXISTS (SELECT 1 FROM holidays WHERE date = p_sale_date AND is_active = true)
    );

    IF v_is_weekend_or_holiday THEN
        v_day_type := 'weekends_holidays';
    ELSE
        v_day_type := 'weekdays';
    END IF;

    -- Prioridade 1: user_product (Específica para usuário E produto)
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

    -- Prioridade 2: user (Específica para usuário)
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

    -- Prioridade 3: product (Específica para produto/serviço)
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

    -- Prioridade 4: general (Regra Geral)
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
