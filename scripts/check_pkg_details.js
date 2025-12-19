
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const pkgId = '7f093a19-4ba6-455b-b9d0-087093557e0e';
  try {
    const { data: pkg, error: err1 } = await supabase.rpc('exec_sql', { 
      query: `SELECT cp.*, c.name as owner_name FROM client_packages cp JOIN clients c ON cp.client_id = c.id WHERE cp.id = '${pkgId}'` 
    });
    console.log("PACKAGE:", JSON.stringify(pkg));

    const { data: cons, error: err2 } = await supabase.rpc('exec_sql', { 
      query: `SELECT * FROM package_consumptions WHERE package_id = '${pkgId}' ORDER BY consumed_at DESC LIMIT 5` 
    });
    console.log("CONSUMPTIONS:", JSON.stringify(cons));

  } catch (e) {
    console.log("ERROR:" + e.message);
  }
}
check();
