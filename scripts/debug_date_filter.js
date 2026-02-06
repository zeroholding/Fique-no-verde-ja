const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Env Vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspect() {
  console.log("--- INSPECTING COMMISSIONS SCHEMA & DATA ---");
  
  // 1. Check Schema Column Type
  const { data: schema, error: schemaErr } = await supabase.rpc('exec_sql', {
    query: `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'commissions' AND column_name = 'reference_date'
    `
  });
  
  if (schemaErr) console.error("Schema Error:", schemaErr);
  else console.log("Column Type:", schema[0]);

  // 2. Fetch the specific problem record
  // Sale ID from user: 09859d36-28b7-46db-9712-1d00807bdf08 (partial from screenshot, but let's try searching by sale_id or similar if needed. Screenshot shows Sale column with ID)
  // Screenshot shows: "09859d36..."
  
  const saleIdStart = '09859d36';
  
  const { data: records, error: recErr } = await supabase.rpc('exec_sql', {
    query: `
        SELECT 
            id, 
            sale_id, 
            reference_date as "Raw Reference Date",
            reference_date AT TIME ZONE 'America/Sao_Paulo' as "AT TIME ZONE SP",
            (reference_date AT TIME ZONE 'America/Sao_Paulo')::date as "Casted Date",
            '2026-02-04'::date as "Filter Date",
            ((reference_date AT TIME ZONE 'America/Sao_Paulo')::date >= '2026-02-04'::date) as "Matches Filter?"
        FROM commissions 
        WHERE sale_id::text LIKE '${saleIdStart}%'
    `
  });

  if (recErr) console.error("Record Error:", recErr);
  else console.table(records);
}

inspect();
