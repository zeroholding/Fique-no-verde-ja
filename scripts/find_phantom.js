
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const phantomId = '7f093a19-4ba6-455b-b9d0-087093557e0e';
  try {
    console.log("Searching for phantomId:", phantomId);

    const { data: pkg } = await supabase.rpc('exec_sql', { 
      query: `SELECT 'client_packages' as source, id, client_id FROM client_packages WHERE id = '${phantomId}'` 
    });
    console.log("In client_packages:", JSON.stringify(pkg));

    const { data: con } = await supabase.rpc('exec_sql', { 
      query: `SELECT 'package_consumptions' as source, id, package_id FROM package_consumptions WHERE id = '${phantomId}'` 
    });
    console.log("In package_consumptions:", JSON.stringify(con));

    const { data: cli } = await supabase.rpc('exec_sql', { 
      query: `SELECT 'clients' as source, id, name FROM clients WHERE id = '${phantomId}'` 
    });
    console.log("In clients:", JSON.stringify(cli));

    const { data: ser } = await supabase.rpc('exec_sql', { 
      query: `SELECT 'services' as source, id, name FROM services WHERE id = '${phantomId}'` 
    });
    console.log("In services:", JSON.stringify(ser));

  } catch (e) {
    console.log("ERROR:" + e.message);
  }
}
check();
