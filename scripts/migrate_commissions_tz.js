const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log("Iniciando migração da tabela 'commissions' para TIMESTAMPTZ...");

  const queries = [
    // 1. Alterar reference_date para TIMESTAMPTZ
    "ALTER TABLE commissions ALTER COLUMN reference_date TYPE TIMESTAMPTZ USING reference_date::TIMESTAMP AT TIME ZONE 'UTC'",
    
    // 2. Alterar outras colunas de data/hora para consistência
    "ALTER TABLE commissions ALTER COLUMN payment_date TYPE TIMESTAMPTZ USING payment_date AT TIME ZONE 'UTC'",
    "ALTER TABLE commissions ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'",
    "ALTER TABLE commissions ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC'",

    // 3. Sincronizar reference_date com sale_date da tabela sales para recuperar o horário real
    `UPDATE commissions c
     SET reference_date = s.sale_date
     FROM sales s
     WHERE c.sale_id = s.id`
  ];

  for (const sql of queries) {
    console.log(`Executando: ${sql.substring(0, 50)}...`);
    const { error } = await supabase.rpc('exec_sql', { query: sql });
    if (error) {
      console.error(`Erro:`, error);
    }
  }

  console.log("Migração de comissões concluída com sucesso!");
}

runMigration();
