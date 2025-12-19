
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  try {
    const { data: clients } = await supabase.rpc('exec_sql', { query: "SELECT id FROM clients WHERE name ILIKE '%J3%'" });
    if (!clients || clients.length === 0) { console.log("J3 not found"); return; }
    
    const j3Id = clients[0].id;
    console.log("J3 ID:", j3Id);

    const { data: pkgs } = await supabase.rpc('exec_sql', { 
      query: `SELECT id, service_id, available_quantity, is_active FROM client_packages WHERE client_id = '${j3Id}'` 
    });
    console.log("J3 PACKAGES:", JSON.stringify(pkgs));

    const { data: cons } = await supabase.rpc('exec_sql', { 
      query: `SELECT pc.* FROM package_consumptions pc JOIN client_packages cp ON pc.package_id = cp.id WHERE cp.client_id = '${j3Id}' ORDER BY pc.consumed_at DESC LIMIT 5` 
    });
    console.log("J3 RECENT CONSUMPTIONS:", JSON.stringify(cons));

  } catch (e) {
    console.log("ERROR:" + e.message);
  }
}
check();
