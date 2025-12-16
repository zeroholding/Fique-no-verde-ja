-- Função para consumir saldo de um pacote
-- Necessária para vendas do tipo "03" (Consumo de Pacote)
-- Rode este script no Editor SQL do Supabase

CREATE OR REPLACE FUNCTION consume_package(
  p_package_id UUID,
  p_sale_id UUID,
  p_quantity NUMERIC
) RETURNS VOID AS $$
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
$$ LANGUAGE plpgsql;
