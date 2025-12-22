
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkEverythingTM() {
  const tmId = '4be828e2-86a2-4bc9-a909-e5212c809ef8';
  console.log("--- CHECKING EVERYTHING FOR TM ---");

  // 1. Packages
  const { data: pkgs } = await s.rpc('exec_sql', { 
    query: `SELECT * FROM client_packages WHERE client_id = '${tmId}'` 
  });
  console.log("\nALL PACKAGES:");
  console.log(JSON.stringify(pkgs, null, 2));

  // 2. Sale Items (Type 02)
  const { data: items02 } = await s.rpc('exec_sql', { 
    query: `SELECT si.id, si.sale_id, si.quantity, si.product_name, s.created_at 
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            WHERE s.client_id = '${tmId}' AND si.sale_type = '02'` 
  });
  console.log("\nSALE ITEMS (TYPE 02 - Adquiridos):");
  console.log(JSON.stringify(items02, null, 2));

  // 3. Consumptions
  const pkgIds = pkgs ? pkgs.map(p => p.id) : [];
  if (pkgIds.length > 0) {
    const { data: cons } = await s.rpc('exec_sql', {
        query: `SELECT * FROM package_consumptions WHERE package_id IN (${pkgIds.map(id => `'${id}'`).join(',')})`
    });
    console.log("\nCONSUMPTIONS RECORDS:");
    console.log(JSON.stringify(cons, null, 2));
  } else {
      console.log("\nNo packages.");
  }

  // 4. Any sales of type 03?
  const { data: items03 } = await s.rpc('exec_sql', {
      query: `SELECT si.*, s.created_at
              FROM sale_items si
              JOIN sales s ON si.sale_id = s.id
              WHERE s.client_id = '${tmId}' AND si.sale_type = '03'`
  });
  console.log("\nSALE ITEMS (TYPE 03):");
  console.log(JSON.stringify(items03, null, 2));
}
checkEverythingTM();
