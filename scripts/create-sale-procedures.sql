-- ============================================================================
-- STORED PROCEDURES PARA VENDAS COM TRANSAÇÕES
-- ============================================================================
-- Este script cria apenas as stored procedures para criar e atualizar vendas
-- Execute este no Supabase SQL Editor
-- ============================================================================

-- 1. Stored procedure para criar uma venda com transação
CREATE OR REPLACE FUNCTION create_sale_with_transaction(
  p_client_id UUID,
  p_attendant_id UUID,
  p_observations TEXT,
  p_payment_method VARCHAR(50),
  p_general_discount_type VARCHAR(20),
  p_general_discount_value NUMERIC,
  p_items JSONB,
  p_sale_type VARCHAR(2),
  p_service_id UUID DEFAULT NULL,
  p_package_id UUID DEFAULT NULL
)
RETURNS TABLE(
  sale_id UUID,
  sale_date TIMESTAMP WITH TIME ZONE,
  total NUMERIC,
  status VARCHAR(20)
) AS $$
DECLARE
  v_sale_id UUID;
  v_sale_date TIMESTAMP WITH TIME ZONE;
  v_subtotal NUMERIC := 0;
  v_total_discount NUMERIC := 0;
  v_item JSONB;
  v_item_subtotal NUMERIC;
  v_item_discount NUMERIC;
  v_item_total NUMERIC;
  v_general_discount NUMERIC := 0;
  v_final_total NUMERIC;
  v_total_quantity INTEGER;
  v_unit_price_package NUMERIC;
BEGIN
  -- Criar a venda
  INSERT INTO sales (
    client_id,
    attendant_id,
    sale_date,
    observations,
    payment_method,
    general_discount_type,
    general_discount_value,
    status
  ) VALUES (
    p_client_id,
    p_attendant_id,
    CURRENT_TIMESTAMP,
    p_observations,
    p_payment_method,
    p_general_discount_type,
    p_general_discount_value,
    'aberta'
  )
  RETURNING id, sale_date INTO v_sale_id, v_sale_date;

  -- Processar itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Calcular subtotal do item
    v_item_subtotal := COALESCE(
      (v_item->>'calculatedSubtotal')::NUMERIC,
      (v_item->>'quantity')::NUMERIC * (v_item->>'unitPrice')::NUMERIC
    );

    -- Calcular desconto do item
    v_item_discount := 0;
    IF (v_item->>'discountType') = 'percentage' THEN
      v_item_discount := v_item_subtotal * ((v_item->>'discountValue')::NUMERIC / 100);
    ELSIF (v_item->>'discountType') = 'fixed' THEN
      v_item_discount := (v_item->>'discountValue')::NUMERIC;
    END IF;

    v_item_total := v_item_subtotal - v_item_discount;

    -- Inserir item da venda
    INSERT INTO sale_items (
      sale_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      discount_type,
      discount_value,
      subtotal,
      discount_amount,
      total
    ) VALUES (
      v_sale_id,
      (v_item->>'productId')::UUID,
      v_item->>'productName',
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'unitPrice')::NUMERIC,
      v_item->>'discountType',
      COALESCE((v_item->>'discountValue')::NUMERIC, 0),
      v_item_subtotal,
      v_item_discount,
      v_item_total
    );

    v_subtotal := v_subtotal + v_item_subtotal;
    v_total_discount := v_total_discount + v_item_discount;
  END LOOP;

  -- Calcular desconto geral
  IF p_general_discount_type = 'percentage' THEN
    v_general_discount := v_subtotal * (p_general_discount_value / 100);
  ELSIF p_general_discount_type = 'fixed' THEN
    v_general_discount := p_general_discount_value;
  END IF;

  v_final_total := v_subtotal - v_total_discount - v_general_discount;

  -- Atualizar totais da venda
  UPDATE sales
  SET
    subtotal = v_subtotal,
    total_discount = v_total_discount + v_general_discount,
    total = v_final_total
  WHERE id = v_sale_id;

  -- Lógica específica por tipo de venda
  IF p_sale_type = '02' AND p_service_id IS NOT NULL THEN
    -- VENDA DE PACOTE
    SELECT (p_items->0->>'quantity')::INTEGER INTO v_total_quantity;
    v_unit_price_package := v_final_total / v_total_quantity;

    INSERT INTO client_packages (
      client_id,
      service_id,
      sale_id,
      initial_quantity,
      consumed_quantity,
      available_quantity,
      unit_price,
      total_paid,
      is_active
    ) VALUES (
      p_client_id,
      p_service_id,
      v_sale_id,
      v_total_quantity,
      0,
      v_total_quantity,
      v_unit_price_package,
      v_final_total,
      true
    );

  ELSIF p_sale_type = '03' AND p_package_id IS NOT NULL THEN
    -- CONSUMO DE PACOTE
    SELECT (p_items->0->>'quantity')::INTEGER INTO v_total_quantity;
    PERFORM consume_package(p_package_id, v_sale_id, v_total_quantity);
  END IF;

  -- Retornar resultado
  RETURN QUERY
  SELECT
    v_sale_id,
    v_sale_date,
    v_final_total,
    'aberta'::VARCHAR(20);

END;
$$ LANGUAGE plpgsql;

-- 2. Stored procedure para atualizar uma venda com transação
CREATE OR REPLACE FUNCTION update_sale_with_transaction(
  p_sale_id UUID,
  p_client_id UUID,
  p_observations TEXT,
  p_payment_method VARCHAR(50),
  p_general_discount_type VARCHAR(20),
  p_general_discount_value NUMERIC,
  p_items JSONB
)
RETURNS TABLE(
  total NUMERIC
) AS $$
DECLARE
  v_subtotal NUMERIC := 0;
  v_total_discount NUMERIC := 0;
  v_item JSONB;
  v_item_subtotal NUMERIC;
  v_item_discount NUMERIC;
  v_item_total NUMERIC;
  v_general_discount NUMERIC := 0;
  v_final_total NUMERIC;
BEGIN
  -- Atualizar a venda
  UPDATE sales
  SET
    client_id = p_client_id,
    observations = p_observations,
    payment_method = p_payment_method,
    general_discount_type = p_general_discount_type,
    general_discount_value = p_general_discount_value
  WHERE id = p_sale_id;

  -- Remover itens antigos
  DELETE FROM sale_items WHERE sale_id = p_sale_id;

  -- Processar novos itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_subtotal := COALESCE(
      (v_item->>'calculatedSubtotal')::NUMERIC,
      (v_item->>'quantity')::NUMERIC * (v_item->>'unitPrice')::NUMERIC
    );

    v_item_discount := 0;
    IF (v_item->>'discountType') = 'percentage' THEN
      v_item_discount := v_item_subtotal * ((v_item->>'discountValue')::NUMERIC / 100);
    ELSIF (v_item->>'discountType') = 'fixed' THEN
      v_item_discount := (v_item->>'discountValue')::NUMERIC;
    END IF;

    v_item_total := v_item_subtotal - v_item_discount;

    INSERT INTO sale_items (
      sale_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      discount_type,
      discount_value,
      subtotal,
      discount_amount,
      total
    ) VALUES (
      p_sale_id,
      (v_item->>'productId')::UUID,
      v_item->>'productName',
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'unitPrice')::NUMERIC,
      v_item->>'discountType',
      COALESCE((v_item->>'discountValue')::NUMERIC, 0),
      v_item_subtotal,
      v_item_discount,
      v_item_total
    );

    v_subtotal := v_subtotal + v_item_subtotal;
    v_total_discount := v_total_discount + v_item_discount;
  END LOOP;

  -- Calcular desconto geral
  IF p_general_discount_type = 'percentage' THEN
    v_general_discount := v_subtotal * (p_general_discount_value / 100);
  ELSIF p_general_discount_type = 'fixed' THEN
    v_general_discount := p_general_discount_value;
  END IF;

  v_final_total := v_subtotal - v_total_discount - v_general_discount;

  -- Atualizar totais
  UPDATE sales
  SET
    subtotal = v_subtotal,
    total_discount = v_total_discount + v_general_discount,
    total = v_final_total
  WHERE id = p_sale_id;

  RETURN QUERY SELECT v_final_total;

END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SUCESSO!
-- ============================================================================
-- As stored procedures foram criadas com sucesso.
-- Agora você pode usar estas funções no seu código para garantir
-- transações reais no PostgreSQL.
-- ============================================================================
