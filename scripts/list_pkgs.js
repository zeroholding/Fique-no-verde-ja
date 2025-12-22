
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function listPackages() {
  const { data: pkgs, error } = await s.rpc('exec_sql', { 
    query: `SELECT cp.id, c.name, cp.initial_quantity, cp.available_quantity, cp.consumed_quantity, cp.is_active 
            FROM client_packages cp 
            JOIN clients c ON cp.client_id = c.id` 
  });
  if (error) {
      console.error(error);
      return;
  }
  console.log(JSON.stringify(pkgs, null, 2));
}
listPackages();
