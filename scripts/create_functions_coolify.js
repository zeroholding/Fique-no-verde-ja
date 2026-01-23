const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function createFunctions() {
  console.log('=== CRIANDO FUNÇÕES NO COOLIFY ===\n');
  
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('Conectado!\n');
    
    // Function 1: exec_sql
    await client.query(`
      CREATE OR REPLACE FUNCTION public.exec_sql(query text)
       RETURNS jsonb
       LANGUAGE plpgsql
       SECURITY DEFINER
      AS $function$
      DECLARE
        result JSONB;
      BEGIN
        BEGIN
          EXECUTE 'WITH q AS (' || query || ') SELECT jsonb_agg(q) FROM q' INTO result;
          RETURN COALESCE(result, '[]'::jsonb);
        EXCEPTION WHEN OTHERS THEN
          EXECUTE query;
          RETURN '[]'::jsonb;
        END;
      END;
      $function$
    `);
    console.log('✅ exec_sql criada');
    
    // Function 2: get_applicable_commission_policy
    await client.query(`
      CREATE OR REPLACE FUNCTION public.get_applicable_commission_policy(p_user_id uuid, p_product_id uuid, p_sale_date date, p_sale_type character varying)
       RETURNS uuid
       LANGUAGE plpgsql
      AS $function$
      DECLARE
          v_policy_id UUID;
          v_is_weekend_or_holiday BOOLEAN;
          v_day_type VARCHAR(20);
      BEGIN
          v_is_weekend_or_holiday := (
              EXTRACT(DOW FROM p_sale_date) IN (0,6) OR
              EXISTS (SELECT 1 FROM holidays WHERE date = p_sale_date AND is_active = true)
          );

          IF v_is_weekend_or_holiday THEN
              v_day_type := 'weekends_holidays';
          ELSE
              v_day_type := 'weekdays';
          END IF;

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
    `);
    console.log('✅ get_applicable_commission_policy criada');
    
    // Verify
    const res = await client.query(`
      SELECT proname FROM pg_proc 
      JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
      WHERE pg_namespace.nspname = 'public' AND proname IN ('exec_sql', 'get_applicable_commission_policy', 'consume_package')
    `);
    console.log('\n✅ Funções no Coolify:', res.rows.map(r => r.proname).join(', '));
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

createFunctions();
