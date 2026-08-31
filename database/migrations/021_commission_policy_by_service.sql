-- =====================================================
-- Migracao 021: politica de comissao por SERVICO
--
-- Demanda: "COMISSAO | 3,5% - RECLAMACOES - AGOSTO/2026 - A PARTIR"
--   Regra para 01 tipo de servico (Reclamacao), 3,5% em dia util,
--   vigencia a partir de 01/08/2026, sem prazo final, para todos os
--   atendentes. Demais servicos seguem em 2,5%. Fim de semana e feriado
--   de Reclamacao seguem em 10%. Consumo de pacote segue em R$ 0,25/un.
--
-- PROBLEMA QUE ESTA MIGRACAO RESOLVE
--   A politica de comissao nao tinha dimensao de servico. As duas colunas
--   que poderiam apontar para um servico nao servem:
--     - product_id referencia products(id), tabela com 1 linha, e
--       sale_items.product_id esta NULO nas 8.070 linhas. Os escopos
--       'product' e 'user_product' nunca sao alcancados.
--     - sale_type nao e servico: e 01-Comum, 02-Pacote, 03-Consumo de
--       pacote. Os tres servicos aparecem em 01.
--   O servico so existe como texto em sale_items.product_name. Logo, era
--   impossivel criar regra para um servico so.
--
-- Idempotente: pode ser executada mais de uma vez.
-- =====================================================

BEGIN;

-- -----------------------------------------------------
-- 1) Dimensao de servico na politica
-- -----------------------------------------------------
ALTER TABLE commission_policies
  ADD COLUMN IF NOT EXISTS service_id UUID;

-- RESTRICT, e nao SET NULL: apagar um servico que tem regra de comissao
-- deve falhar em voz alta. Com SET NULL a regra ficaria orfa e passaria a
-- nao casar com nada, silenciosamente, mudando o valor pago.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'commission_policies_service_id_fkey'
       AND conrelid = 'commission_policies'::regclass
  ) THEN
    ALTER TABLE commission_policies
      ADD CONSTRAINT commission_policies_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Escopo 'service' sem servico informado casaria com tudo. Barrado no banco.
ALTER TABLE commission_policies
  DROP CONSTRAINT IF EXISTS commission_policies_service_scope_check;
ALTER TABLE commission_policies
  ADD CONSTRAINT commission_policies_service_scope_check
  CHECK (scope <> 'service' OR service_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_commission_policies_service
  ON commission_policies(service_id);

COMMENT ON COLUMN commission_policies.service_id IS
  'Servico ao qual a politica se aplica; obrigatorio quando scope = service';

-- -----------------------------------------------------
-- 2) Funcao de resolucao com escopo de servico
--
-- O 5o parametro tem DEFAULT NULL, entao as chamadas antigas com 4
-- argumentos continuam validas: sem nome de servico, o escopo 'service' e
-- ignorado e a resolucao cai onde caia antes. Nada quebra se algum ponto
-- do codigo nao for atualizado.
--
-- PRECEDENCIA (do mais especifico para o mais generico):
--   1. user_product  atendente + produto
--   2. user          atendente
--   3. product       produto
--   4. service       SERVICO            <-- novo
--   5. general       todos
--
-- Registro de uma decisao: 'user' vem ANTES de 'service'. Uma politica
-- pessoal continua vencendo uma regra de servico. Hoje nao existe nenhuma
-- politica com escopo de usuario (as 6 sao 'general'), entao isso nao muda
-- nada agora; fica explicito para quem criar a primeira saber que ela
-- passa na frente da regra por servico.
-- -----------------------------------------------------
DROP FUNCTION IF EXISTS get_applicable_commission_policy(UUID, UUID, DATE, VARCHAR);

CREATE OR REPLACE FUNCTION get_applicable_commission_policy(
    p_user_id UUID,
    p_product_id UUID,
    p_sale_date DATE,
    p_sale_type VARCHAR(3),
    p_service_name VARCHAR DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $function$
DECLARE
    v_policy_id UUID;
    v_is_weekend_or_holiday BOOLEAN;
    v_day_type VARCHAR(20);
    v_service_id UUID;
BEGIN
    v_is_weekend_or_holiday := (
        EXTRACT(DOW FROM p_sale_date) IN (0,6) OR
        EXISTS (
          SELECT 1 FROM holidays
           WHERE date = p_sale_date AND is_active = true
        )
    );

    IF v_is_weekend_or_holiday THEN
        v_day_type := 'weekends_holidays';
    ELSE
        v_day_type := 'weekdays';
    END IF;

    -- O servico chega como texto porque sale_items nao tem service_id.
    -- A comparacao normaliza acento e caixa, senao "Reclamacao" digitado
    -- sem acento deixaria de casar com "Reclamação".
    IF p_service_name IS NOT NULL THEN
        SELECT id INTO v_service_id
          FROM services
         WHERE fnvj_normalize_text(name) = fnvj_normalize_text(p_service_name)
         LIMIT 1;
    END IF;

    -- 1) atendente + produto
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

    -- 2) atendente
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

    -- 3) produto
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

    -- 4) servico
    IF v_service_id IS NOT NULL THEN
        SELECT id INTO v_policy_id
        FROM commission_policies
        WHERE scope = 'service'
          AND service_id = v_service_id
          AND is_active = true
          AND (sale_type = 'all' OR sale_type = p_sale_type)
          AND p_sale_date >= valid_from
          AND (valid_until IS NULL OR p_sale_date <= valid_until)
          AND (applies_to = 'all' OR applies_to = v_day_type)
        ORDER BY (sale_type = p_sale_type) DESC, valid_from DESC
        LIMIT 1;
        IF v_policy_id IS NOT NULL THEN RETURN v_policy_id; END IF;
    END IF;

    -- 5) geral
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
$function$;

-- -----------------------------------------------------
-- 3) A regra de Reclamacao
--
-- Sao DUAS linhas, uma para cada tipo de venda, em vez de uma com
-- sale_type = 'all'. Motivo: 'all' tambem casaria com o tipo 03 (consumo
-- de pacote) e, como o escopo de servico vem ANTES do geral, passaria na
-- frente da regra de R$ 0,25 por unidade. Amarrando em 01 e 02, o tipo 03
-- nunca alcanca uma politica de servico e continua caindo no geral.
-- -----------------------------------------------------
INSERT INTO commission_policies (
  name, description, type, value, scope, service_id,
  applies_to, sale_type, valid_from, valid_until, is_active
)
SELECT
  'Comissão Reclamação - Dias Úteis (Tipo ' || t.sale_type || ')',
  'Comissao de 3,5% sobre Reclamacao em dias uteis, tipo de venda '
    || t.sale_type || '. Vigencia a partir de 08/2026, sem prazo final.',
  'percentage',
  3.5,
  'service',
  s.id,
  'weekdays',
  t.sale_type,
  DATE '2026-08-01',
  NULL,
  true
FROM services s
CROSS JOIN (VALUES ('01'), ('02')) AS t(sale_type)
WHERE fnvj_normalize_text(s.name) LIKE '%reclamac%'
  AND NOT EXISTS (
    SELECT 1 FROM commission_policies p
     WHERE p.scope = 'service'
       AND p.service_id = s.id
       AND p.sale_type = t.sale_type
       AND p.applies_to = 'weekdays'
       AND p.valid_from = DATE '2026-08-01'
  );

-- -----------------------------------------------------
-- 4) Recalculo da competencia de agosto/2026
--
-- Usa a PROPRIA funcao de resolucao, e nao a taxa escrita na mao: se a
-- logica acima estiver errada, os numeros saem errados e a verificacao no
-- fim do arquivo denuncia.
--
-- Somente comissoes 'a_pagar'. O trigger de integridade proibe alterar
-- comissao 'pago', e agosto nao tem pagamento fechado (verificado: 0).
-- -----------------------------------------------------
WITH alvo AS (
  SELECT
    c.id AS commission_id,
    c.sale_id,
    c.base_amount,
    get_applicable_commission_policy(
      c.user_id,
      si.product_id,
      (s.sale_date AT TIME ZONE 'America/Sao_Paulo')::date,
      COALESCE(si.sale_type, '01'),
      si.product_name
    ) AS policy_id
  FROM commissions c
  JOIN sales s ON s.id = c.sale_id
  JOIN sale_items si ON si.id = c.sale_item_id
  WHERE c.status = 'a_pagar'
    AND (s.sale_date AT TIME ZONE 'America/Sao_Paulo')::date
        >= DATE '2026-08-01'
    AND fnvj_normalize_text(si.product_name) LIKE '%reclamac%'
),
resolvido AS (
  SELECT
    a.commission_id,
    a.sale_id,
    a.base_amount,
    a.policy_id,
    cp.type AS policy_type,
    cp.value AS policy_value
  FROM alvo a
  JOIN commission_policies cp ON cp.id = a.policy_id
  WHERE cp.type = 'percentage'
)
UPDATE commissions c
SET commission_type = 'percentage',
    commission_rate = r.policy_value,
    commission_amount = ROUND(r.base_amount * r.policy_value / 100, 2),
    commission_policy_id = r.policy_id,
    updated_at = CURRENT_TIMESTAMP
FROM resolvido r
WHERE c.id = r.commission_id
  AND (
    c.commission_rate IS DISTINCT FROM r.policy_value
    OR c.commission_policy_id IS DISTINCT FROM r.policy_id
  );

-- -----------------------------------------------------
-- 5) Recompor o total de comissao da venda
--
-- sales.commission_amount e o somatorio dos itens. Sem isso, o item passa
-- a 3,5% e o total da venda continua no valor antigo.
-- -----------------------------------------------------
UPDATE sales s
SET commission_amount = totals.total_commission,
    updated_at = CURRENT_TIMESTAMP
FROM (
  SELECT c.sale_id,
         SUM(c.commission_amount) AS total_commission
    FROM commissions c
   WHERE c.status <> 'cancelado'
     AND c.sale_id IN (
       SELECT DISTINCT c2.sale_id
         FROM commissions c2
         JOIN sales s2 ON s2.id = c2.sale_id
         JOIN sale_items si2 ON si2.id = c2.sale_item_id
        WHERE (s2.sale_date AT TIME ZONE 'America/Sao_Paulo')::date
              >= DATE '2026-08-01'
          AND fnvj_normalize_text(si2.product_name) LIKE '%reclamac%'
     )
   GROUP BY c.sale_id
) totals
WHERE s.id = totals.sale_id
  AND s.commission_amount IS DISTINCT FROM totals.total_commission;

COMMIT;

-- =====================================================
-- Verificacao (executar apos a migracao)
-- =====================================================
-- Esperado: 2 linhas, 3,5%, weekdays, tipos 01 e 02, desde 2026-08-01.
-- SELECT p.name, p.value, p.applies_to, p.sale_type, p.valid_from,
--        p.valid_until, s.name AS servico
--   FROM commission_policies p
--   JOIN services s ON s.id = p.service_id
--  WHERE p.scope = 'service' ORDER BY p.sale_type;
--
-- Verificado em producao: 232 comissoes a 3,5% somando 1.469,20
-- (antes: 1.049,34 a 2,5%; diferenca de +419,86). O total sai de ROUND por
-- linha, nao do arredondamento da soma: SUM(base)*3,5% daria 1.469,06.
-- As linhas de Reclamacao com status 'cancelado' (4 em agosto) seguem em
-- 2,5% de proposito: comissao cancelada nao e paga.
-- SELECT c.commission_rate, COUNT(*), SUM(c.commission_amount)
--   FROM commissions c
--   JOIN sale_items si ON si.id = c.sale_item_id
--  WHERE fnvj_normalize_text(si.product_name) LIKE '%reclamac%'
--    AND c.status = 'a_pagar'
--    AND (c.reference_date AT TIME ZONE 'America/Sao_Paulo')::date
--        BETWEEN '2026-08-01' AND '2026-08-31'
--  GROUP BY 1 ORDER BY 1;
--
-- Esperado: Atrasos e Cancelados INTACTOS em 2,5% nos dias uteis.
-- Esperado: consumo de pacote (tipo 03) INTACTO em 0,25 por unidade.
