const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectMetadata() {
  console.log('--- Metadata Inspection ---');
  
  // 1. Column Types and Default Values
  const typeSql = `
    SELECT 
      table_name, 
      column_name, 
      data_type, 
      column_default,
      is_nullable
    FROM information_schema.columns 
    WHERE table_name IN ('sales', 'commissions')
      AND column_name IN ('sale_date', 'reference_date');
  `;
  
  // 2. Triggers
  const triggerSql = `
    SELECT 
      event_object_table as table_name,
      trigger_name,
      event_manipulation,
      action_statement,
      action_timing
    FROM information_schema.triggers
    WHERE event_object_table IN ('sales', 'commissions');
  `;

  const { data: types, error: typeErr } = await supabase.rpc('exec_sql', { query: typeSql });
  if (typeErr) console.error('Type Error:', typeErr);
  else console.table(types);

  const { data: triggers, error: trigErr } = await supabase.rpc('exec_sql', { query: triggerSql });
  if (trigErr) console.error('Trigger Error:', trigErr);
  else console.table(triggers);
}

inspectMetadata();
