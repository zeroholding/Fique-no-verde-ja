
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const saleId = 'f4c820ca-b207-4e34-92a0-3af99f501abc';
  try {
    const { data: cons, error: err1 } = await supabase.rpc('exec_sql', { 
      query: `SELECT * FROM package_consumptions WHERE sale_id = '${saleId}'` 
    });
    console.log("CONSUMPTIONS:", JSON.stringify(cons));

    const { data: items, error: err2 } = await supabase.rpc('exec_sql', { 
      query: `SELECT * FROM sale_items WHERE sale_id = '${saleId}'` 
    });
    console.log("ITEMS:", JSON.stringify(items));

    const { data: pkgs, error: err3 } = await supabase.rpc('exec_sql', { 
      query: `SELECT * FROM client_packages WHERE id = (SELECT package_id FROM package_consumptions WHERE sale_id = '${saleId}' LIMIT 1)` 
    });
    console.log("PACKAGE:", JSON.stringify(pkgs));

  } catch (e) {
    console.log("ERROR:" + e.message);
  }
}
check();
