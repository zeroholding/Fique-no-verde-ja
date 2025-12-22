
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function searchDuplicateTM() {
  console.log("Searching for duplicate TMs or 720/610 packages...");
  
  const { data: clients } = await s.rpc('exec_sql', { 
    query: `SELECT id, name, client_type FROM clients WHERE name ILIKE '%TM%'` 
  });
  console.log("Clients matching TM:", JSON.stringify(clients, null, 2));

  const { data: mysteryPkgs } = await s.rpc('exec_sql', {
    query: `SELECT cp.*, c.name as client_name 
            FROM client_packages cp
            JOIN clients c ON cp.client_id = c.id
            WHERE cp.initial_quantity IN (610, 620, 710, 720) 
               OR cp.available_quantity IN (610, 620, 710, 720)
               OR cp.available_quantity < -50000`
  });
  console.log("\nMystery Packages Found:", JSON.stringify(mysteryPkgs, null, 2));
}
searchDuplicateTM();
