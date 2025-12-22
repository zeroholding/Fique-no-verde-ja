
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function repairTM() {
  console.log("Repairing TM packages (v2)...");
  
  const pkg1 = 'b3551f91-f9f9-4a20-8bab-23b613d77c82'; // Sale 100
  const pkg2 = '415cb64c-6f0a-478d-933a-a2c5628dd1de'; // Sale 10
  
  // Package 1
  await s.rpc('exec_sql', { 
    query: `UPDATE client_packages SET initial_quantity = 100, available_quantity = 100, consumed_quantity = 0 WHERE id = '${pkg1}'` 
  });
  console.log("Package 1 reset to 100.");

  // Package 2
  await s.rpc('exec_sql', { 
    query: `UPDATE client_packages SET initial_quantity = 10, available_quantity = 10, consumed_quantity = 0 WHERE id = '${pkg2}'` 
  });
  console.log("Package 2 reset to 10.");

  console.log("TM Data cleaned. You should now see 110 units total and be able to delete the sales.");
}
repairTM();
