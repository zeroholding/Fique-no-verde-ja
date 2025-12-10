-- Criações mínimas para o sistema de comissões funcionar

-- 1) Função utilitária para updated_at (idempotente)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) Ajustes na tabela commission_policies (caso ainda não existam)
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

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commission_policies' AND column_name = 'applies_to'
  ) THEN
    ALTER TABLE commission_policies
      ADD COLUMN applies_to VARCHAR(20) NOT NULL DEFAULT 'all'
      CHECK (applies_to IN ('all', 'weekdays', 'weekends_holidays'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commission_policies' AND column_name = 'consider_business_days'
  ) THEN
    ALTER TABLE commission_policies
      ADD COLUMN consider_business_days BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commission_policies' AND column_name = 'valid_from'
  ) THEN
    ALTER TABLE commission_policies ADD COLUMN valid_from DATE NOT NULL DEFAULT CURRENT_DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commission_policies' AND column_name = 'valid_until'
  ) THEN
    ALTER TABLE commission_policies ADD COLUMN valid_until DATE;
  END IF;
END $$;

-- 3) Tabela de comissões (se ainda não existir)
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  sale_item_id UUID REFERENCES sale_items(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  base_amount DECIMAL(10, 2) NOT NULL,
  commission_type VARCHAR(20) NOT NULL CHECK (commission_type IN ('percentage', 'fixed')),
  commission_rate DECIMAL(10, 2) NOT NULL,
  commission_amount DECIMAL(10, 2) NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'a_pagar' CHECK (status IN ('a_pagar', 'pago', 'cancelado')),

  reference_date DATE NOT NULL,
  payment_date DATE,
  considers_business_days BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT check_positive_base CHECK (base_amount >= 0),
  CONSTRAINT check_positive_rate CHECK (commission_rate >= 0),
  CONSTRAINT check_positive_amount CHECK (commission_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_commissions_sale ON commissions(sale_id);
CREATE INDEX IF NOT EXISTS idx_commissions_user ON commissions(user_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_reference_date ON commissions(reference_date);
CREATE INDEX IF NOT EXISTS idx_commissions_payment_date ON commissions(payment_date);

DROP TRIGGER IF EXISTS trigger_update_commissions_updated_at ON commissions;
CREATE TRIGGER trigger_update_commissions_updated_at
  BEFORE UPDATE ON commissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4) Funções de política e cálculo (idempotentes)
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
      AND p_sale_date >= valid_from
      AND (valid_until IS NULL OR p_sale_date <= valid_until)
      AND (applies_to = 'all' OR applies_to = v_day_type)
    ORDER BY valid_from DESC
    LIMIT 1;
    IF v_policy_id IS NOT NULL THEN RETURN v_policy_id; END IF;

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
    IF v_policy_id IS NOT NULL THEN RETURN v_policy_id; END IF;

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
    IF v_policy_id IS NOT NULL THEN RETURN v_policy_id; END IF;

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
    SELECT * INTO v_policy FROM commission_policies WHERE id = p_policy_id;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    IF v_policy.type = 'percentage' THEN
        v_commission := p_net_amount * (v_policy.value / 100);
    ELSIF v_policy.type = 'fixed_per_unit' THEN
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
