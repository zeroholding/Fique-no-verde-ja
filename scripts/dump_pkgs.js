
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function dump() {
  try {
    const { data: pkgs } = await supabase.rpc('exec_sql', { 
      query: "SELECT cp.id, c.name as client_name, cp.available_quantity FROM client_packages cp JOIN clients c ON cp.client_id = c.id" 
    });
    console.log("---ALL_PACKAGES---");
    console.log(JSON.stringify(pkgs));
    console.log("---END---");
  } catch (e) {
    console.log("ERROR:" + e.message);
  }
}
dump();
