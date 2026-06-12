-- Commission calendar, post-payment adjustments and competence payments.
-- This migration is idempotent and can be executed more than once.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  is_national BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
CREATE INDEX IF NOT EXISTS idx_holidays_active ON holidays(is_active);

ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS commission_policy_id UUID;

ALTER TABLE commissions
  DROP CONSTRAINT IF EXISTS commissions_commission_type_check;
ALTER TABLE commissions
  ADD CONSTRAINT commissions_commission_type_check
  CHECK (
    commission_type IN ('percent', 'percentage', 'fixed', 'fixed_per_unit')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commissions_commission_policy_id_fkey'
      AND conrelid = 'commissions'::regclass
  ) THEN
    ALTER TABLE commissions
      ADD CONSTRAINT commissions_commission_policy_id_fkey
      FOREIGN KEY (commission_policy_id)
      REFERENCES commission_policies(id)
      ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO holidays (date, name, is_national, is_active)
VALUES
  ('2026-01-01', 'Confraternizacao Universal', true, true),
  ('2026-02-16', 'Carnaval', true, true),
  ('2026-02-17', 'Carnaval', true, true),
  ('2026-04-03', 'Sexta-feira Santa', true, true),
  ('2026-04-21', 'Tiradentes', true, true),
  ('2026-05-01', 'Dia do Trabalho', true, true),
  ('2026-06-04', 'Corpus Christi', true, true),
  ('2026-09-07', 'Independencia do Brasil', true, true),
  ('2026-10-12', 'Nossa Senhora Aparecida', true, true),
  ('2026-11-02', 'Finados', true, true),
  ('2026-11-15', 'Proclamacao da Republica', true, true),
  ('2026-11-20', 'Dia da Consciencia Negra', true, true),
  ('2026-12-25', 'Natal', true, true)
ON CONFLICT (date) DO UPDATE
SET
  name = EXCLUDED.name,
  is_national = EXCLUDED.is_national,
  is_active = true,
  updated_at = CURRENT_TIMESTAMP;

-- Repair pending commissions from the reported date. Paid commissions are
-- intentionally immutable and must be corrected through an adjustment.
WITH applicable AS (
  SELECT
    c.id AS commission_id,
    c.sale_id,
    get_applicable_commission_policy(
      c.user_id,
      si.product_id,
      (s.sale_date AT TIME ZONE 'America/Sao_Paulo')::date,
      COALESCE(si.sale_type, '01')
    ) AS policy_id,
    c.base_amount
  FROM commissions c
  JOIN sales s ON s.id = c.sale_id
  LEFT JOIN sale_items si ON si.id = c.sale_item_id
  WHERE c.status = 'a_pagar'
    AND (c.reference_date AT TIME ZONE 'America/Sao_Paulo')::date =
      DATE '2026-06-04'
),
percentage_policies AS (
  SELECT
    a.commission_id,
    a.sale_id,
    a.policy_id,
    a.base_amount,
    cp.value
  FROM applicable a
  JOIN commission_policies cp ON cp.id = a.policy_id
  WHERE cp.type = 'percentage'
),
updated_commissions AS (
  UPDATE commissions c
  SET commission_rate = pp.value,
      commission_amount = ROUND(pp.base_amount * (pp.value / 100), 2),
      commission_policy_id = pp.policy_id,
      updated_at = CURRENT_TIMESTAMP
  FROM percentage_policies pp
  WHERE c.id = pp.commission_id
  RETURNING c.sale_id, pp.policy_id
)
UPDATE sales s
SET commission_amount = totals.total_commission,
    commission_policy_id = totals.policy_id,
    updated_at = CURRENT_TIMESTAMP
FROM (
  SELECT
    uc.sale_id,
    (ARRAY_AGG(uc.policy_id))[1] AS policy_id,
    (
      SELECT COALESCE(SUM(c2.commission_amount), 0)
      FROM commissions c2
      WHERE c2.sale_id = uc.sale_id
        AND c2.status != 'cancelado'
    ) AS total_commission
  FROM updated_commissions uc
  GROUP BY uc.sale_id
) totals
WHERE s.id = totals.sale_id;

CREATE TABLE IF NOT EXISTS commission_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  refund_id UUID REFERENCES sale_refunds(id) ON DELETE SET NULL,
  origin_competence DATE NOT NULL,
  adjustment_type VARCHAR(30) NOT NULL DEFAULT 'refund'
    CONSTRAINT commission_adjustments_adjustment_type_check
    CHECK (adjustment_type IN ('refund', 'cancellation', 'manual')),
  refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (refund_amount >= 0),
  commission_before NUMERIC(12, 2) NOT NULL
    CHECK (commission_before >= 0),
  commission_after NUMERIC(12, 2) NOT NULL
    CHECK (commission_after >= 0),
  amount NUMERIC(12, 2) NOT NULL
    CHECK (amount > 0),
  applied_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (applied_amount >= 0 AND applied_amount <= amount),
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'partially_applied', 'applied', 'cancelled')),
  reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (refund_id)
);

ALTER TABLE commission_adjustments
  DROP CONSTRAINT IF EXISTS commission_adjustments_adjustment_type_check;
ALTER TABLE commission_adjustments
  ADD CONSTRAINT commission_adjustments_adjustment_type_check
  CHECK (adjustment_type IN ('refund', 'cancellation', 'manual'));

CREATE INDEX IF NOT EXISTS idx_commission_adjustments_user
  ON commission_adjustments(user_id);
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_sale
  ON commission_adjustments(sale_id);
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_status
  ON commission_adjustments(status);
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_competence
  ON commission_adjustments(origin_competence);

CREATE TABLE IF NOT EXISTS commission_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  competence_month DATE NOT NULL,
  scheduled_payment_date DATE,
  payment_date DATE NOT NULL,
  gross_commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (gross_commission_amount >= 0),
  adjustment_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (adjustment_amount >= 0),
  net_paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (net_paid_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'paid'
    CHECK (status IN ('paid', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (EXTRACT(DAY FROM competence_month) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_payments_active_competence
  ON commission_payments(user_id, competence_month)
  WHERE status = 'paid';
CREATE INDEX IF NOT EXISTS idx_commission_payments_user
  ON commission_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_competence
  ON commission_payments(competence_month);

ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS commission_payment_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commissions_commission_payment_id_fkey'
      AND conrelid = 'commissions'::regclass
  ) THEN
    ALTER TABLE commissions
      ADD CONSTRAINT commissions_commission_payment_id_fkey
      FOREIGN KEY (commission_payment_id)
      REFERENCES commission_payments(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commissions_payment
  ON commissions(commission_payment_id);

CREATE TABLE IF NOT EXISTS commission_payment_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES commission_payments(id) ON DELETE CASCADE,
  adjustment_id UUID NOT NULL REFERENCES commission_adjustments(id) ON DELETE RESTRICT,
  amount_applied NUMERIC(12, 2) NOT NULL CHECK (amount_applied > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (payment_id, adjustment_id)
);

CREATE INDEX IF NOT EXISTS idx_commission_payment_adjustments_payment
  ON commission_payment_adjustments(payment_id);
CREATE INDEX IF NOT EXISTS idx_commission_payment_adjustments_adjustment
  ON commission_payment_adjustments(adjustment_id);

-- Preserve paid history and prevent late commissions in a closed competence.
CREATE OR REPLACE FUNCTION enforce_commission_accounting_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'pago' THEN
      RAISE EXCEPTION
        'COMMISSION_PAID_IMMUTABLE: comissao paga nao pode ser excluida';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'pago' AND (
    NEW.sale_id IS DISTINCT FROM OLD.sale_id OR
    NEW.sale_item_id IS DISTINCT FROM OLD.sale_item_id OR
    NEW.user_id IS DISTINCT FROM OLD.user_id OR
    NEW.base_amount IS DISTINCT FROM OLD.base_amount OR
    NEW.commission_type IS DISTINCT FROM OLD.commission_type OR
    NEW.commission_rate IS DISTINCT FROM OLD.commission_rate OR
    NEW.commission_amount IS DISTINCT FROM OLD.commission_amount OR
    NEW.reference_date IS DISTINCT FROM OLD.reference_date OR
    NEW.payment_date IS DISTINCT FROM OLD.payment_date OR
    NEW.commission_payment_id IS DISTINCT FROM OLD.commission_payment_id OR
    NEW.status IS DISTINCT FROM OLD.status
  ) THEN
    RAISE EXCEPTION
      'COMMISSION_PAID_IMMUTABLE: comissao paga nao pode ser alterada';
  END IF;

  IF NEW.status = 'a_pagar' THEN
    IF EXISTS (
      SELECT 1
      FROM commission_payments cp
      WHERE cp.user_id = NEW.user_id
        AND cp.competence_month =
          DATE_TRUNC(
            'month',
            NEW.reference_date AT TIME ZONE 'America/Sao_Paulo'
          )::date
        AND cp.status = 'paid'
    ) THEN
      RAISE EXCEPTION
        'COMMISSION_COMPETENCE_CLOSED: competencia de comissao ja foi paga';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_commission_accounting_integrity
  ON commissions;
CREATE TRIGGER trigger_commission_accounting_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON commissions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_commission_accounting_integrity();

COMMENT ON TABLE commission_adjustments IS
  'Debitos de comissao gerados depois que a comissao original ja foi paga';
COMMENT ON COLUMN commission_adjustments.amount IS
  'Valor total a descontar em pagamentos futuros';
COMMENT ON COLUMN commission_adjustments.applied_amount IS
  'Parte do ajuste ja abatida em pagamentos';
COMMENT ON TABLE commission_payments IS
  'Registro de pagamento de comissao por atendente e competencia';
COMMENT ON TABLE commission_payment_adjustments IS
  'Valores de ajustes consumidos por cada pagamento de competencia';
