const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deepInspect() {
  console.log('--- Deep Inspection ---');
  
  const sql = `
    -- 1. Table columns with types from pg_attribute
    SELECT 
        a.attname as column_name,
        format_type(a.atttypid, a.atttypmod) as data_type
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'commissions'
      AND a.attnum > 0;

    -- 2. Function definition
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'get_applicable_commission_policy';
  `;

  const { data, error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) console.error('Error:', error);
  else console.log(JSON.stringify(data, null, 2));
}

deepInspect();
