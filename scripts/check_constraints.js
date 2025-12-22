
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await s.rpc('exec_sql', { 
    query: `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'client_packages'::regclass` 
  });
  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}
check();
