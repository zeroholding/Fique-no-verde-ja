-- Função para consumir saldo de um pacote
-- Necessária para vendas do tipo "03" (Consumo de Pacote)
-- Rode este script no Editor SQL do Supabase

CREATE OR REPLACE FUNCTION consume_package(
  p_package_id UUID,
  p_sale_id UUID,
  p_quantity NUMERIC
) RETURNS VOID AS $$
BEGIN
  -- Atualiza o pacote, decrementando o disponível e incrementando o consumido
  UPDATE client_packages
  SET 
    available_quantity = available_quantity - p_quantity,
    consumed_quantity = consumed_quantity + p_quantity,
    updated_at = NOW() -- Assume que existe updated_at, se der erro remova esta linha
  WHERE id = p_package_id;

  -- Verifica se a atualização ocorreu (se o pacote existe)
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pacote não encontrado com ID %', p_package_id;
  END IF;
  
  -- Opcional: Verificar se ficou negativo (embora a API já verifique antes)
  -- IF (SELECT available_quantity FROM client_packages WHERE id = p_package_id) < 0 THEN
  --   RAISE EXCEPTION 'Saldo insuficiente no pacote';
  -- END IF;
END;
$$ LANGUAGE plpgsql;
