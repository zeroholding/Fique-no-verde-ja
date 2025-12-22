
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await s.rpc('exec_sql', { 
    query: `SELECT column_name, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'client_packages' AND column_name = 'sale_id'` 
  });
  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}
check();
