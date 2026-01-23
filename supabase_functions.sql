-- Supabase Functions Export

-- Function: consume_package
CREATE OR REPLACE FUNCTION public.consume_package(p_package_id uuid, p_sale_id uuid, p_quantity numeric)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_unit_price NUMERIC;
BEGIN
  -- 1. Buscar preço unitário do pacote para registrar o consumo financeiro
  SELECT unit_price INTO v_unit_price
  FROM client_packages
  WHERE id = p_package_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pacote não encontrado com ID %', p_package_id;
  END IF;

  -- 2. Atualiza o pacote, decrementando o disponível e incrementando o consumido
  UPDATE client_packages
  SET 
    available_quantity = available_quantity - p_quantity,
    consumed_quantity = consumed_quantity + p_quantity,
    updated_at = NOW()
  WHERE id = p_package_id;

  -- 3. Registra o consumo na tabela unificada (Essencial para o Extrato)
  INSERT INTO package_consumptions (
    package_id,
    sale_id,
    quantity,
    unit_price,
    total_value,
    consumed_at
  ) VALUES (
    p_package_id,
    p_sale_id,
    p_quantity,
    v_unit_price,
    (p_quantity * v_unit_price),
    NOW()
  );

  -- Opcional: Validar saldo negativo
  -- IF (SELECT available_quantity FROM client_packages WHERE id = p_package_id) < 0 THEN
  --   RAISE EXCEPTION 'Saldo insuficiente no pacote';
  -- END IF;
END;
$function$
;

-- Function: exec_sql
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result JSONB;
BEGIN
  -- Tenta executar como uma query que retorna dados (SELECT ou INSERT...RETURNING)
  BEGIN
    EXECUTE 'WITH q AS (' || query || ') SELECT jsonb_agg(q) FROM q' INTO result;
    RETURN COALESCE(result, '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    -- Se falhar (ex: INSERT simples sem retorno), executa o comando puro
    EXECUTE query;
    RETURN '[]'::jsonb;
  END;
END;
$function$
;

-- Function: get_applicable_commission_policy
CREATE OR REPLACE FUNCTION public.get_applicable_commission_policy(p_user_id uuid, p_product_id uuid, p_sale_date date, p_sale_type character varying)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
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
$function$
;

