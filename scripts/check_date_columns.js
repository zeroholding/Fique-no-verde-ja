
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await s.rpc('exec_sql', { 
    query: `SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE column_name IN ('created_at', 'updated_at', 'sale_date', 'consumed_at', 'op_date') 
            AND table_name IN ('sales', 'client_packages', 'package_consumptions', 'sale_items')` 
  });
  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}
check();
