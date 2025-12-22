
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectTM() {
  const tmId = '4be828e2-86a2-4bc9-a909-e5212c809ef8';
  console.log("--- INSPECTING TM ---");

  // 1. Packages
  const { data: pkgs } = await s.rpc('exec_sql', { 
    query: `SELECT * FROM client_packages WHERE client_id = '${tmId}'` 
  });
  console.log("PACKAGES:", JSON.stringify(pkgs, null, 2));

  if (pkgs && pkgs.length > 0) {
      for (const p of pkgs) {
          console.log(`\nConsumptions for Package ${p.id}:`);
          const { data: cons } = await s.rpc('exec_sql', {
              query: `SELECT * FROM package_consumptions WHERE package_id = '${p.id}'`
          });
          console.log(JSON.stringify(cons, null, 2));
      }
  }

  // 2. All Type 02 sales for TM
  const { data: sales02 } = await s.rpc('exec_sql', {
      query: `SELECT s.id, si.quantity, s.created_at, s.observations
              FROM sales s
              JOIN sale_items si ON s.id = si.sale_id
              WHERE s.client_id = '${tmId}' AND si.sale_type = '02'`
  });
  console.log("\nTYPE 02 SALES (Add credits):");
  console.log(JSON.stringify(sales02, null, 2));

  // 3. All Type 03 sales for TM
  const { data: sales03 } = await s.rpc('exec_sql', {
      query: `SELECT s.id, si.quantity, s.created_at, s.observations
              FROM sales s
              JOIN sale_items si ON s.id = si.sale_id
              WHERE s.client_id = '${tmId}' AND si.sale_type = '03'`
  });
  console.log("\nTYPE 03 SALES (Consume credits - as final client):");
  console.log(JSON.stringify(sales03, null, 2));
}
inspectTM();
