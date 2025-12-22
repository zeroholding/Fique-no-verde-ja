
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  const { data: pkgData } = await supabase.rpc('exec_sql', { query: `
    SELECT id FROM client_packages cp JOIN clients c ON cp.client_id = c.id WHERE c.name ILIKE '%J3%' LIMIT 1
  ` });
  
  if (!pkgData || pkgData.length === 0) { console.log("No package found"); return; }
  const pkgId = pkgData[0].id;

  const { data, error } = await supabase.rpc('exec_sql', { query: `
    SELECT * FROM package_consumptions WHERE package_id = '${pkgId}' ORDER BY created_at DESC LIMIT 5
  ` });
  
  if (error) { console.error(error); return; }
  console.log("LAST 5 CONSUMPTIONS:");
  console.log(JSON.stringify(data, null, 2));

  const { data: purchases } = await supabase.rpc('exec_sql', { query: `
    SELECT * FROM sale_items WHERE product_id = '${pkgId}' OR (sale_type = '02' AND product_id IN (SELECT id FROM services WHERE name = 'Atrasos'))
  ` });
  // Wait, sale_type 02 items have service_id? No, they have product_id of the service usually.
  
  console.log("PURCHASES (Type 02?):");
  console.log(JSON.stringify(purchases, null, 2));
}
debug();
