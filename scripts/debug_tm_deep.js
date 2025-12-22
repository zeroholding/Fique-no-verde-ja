
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function deep() {
  const tmId = '4be828e2-86a2-4bc9-a909-e5212c809ef8';
  console.log("--- DEEP INSPECTION TM ---");

  // 1. All client_packages for TM
  const { data: pkgs } = await s.rpc('exec_sql', { 
    query: `SELECT cp.id, cp.initial_quantity, cp.available_quantity, cp.consumed_quantity, cp.sale_id, cp.is_active, s.name as service_name
            FROM client_packages cp
            JOIN services s ON cp.service_id = s.id
            WHERE cp.client_id = '${tmId}'`
  });
  console.log("PACKAGES FOUND:", JSON.stringify(pkgs, null, 2));

  // 2. All package_consumptions for any of TM's packages
  const pkgIds = pkgs ? pkgs.map(p => p.id) : [];
  if (pkgIds.length > 0) {
      const { data: cons } = await s.rpc('exec_sql', {
          query: `SELECT pc.*, s.observations
                  FROM package_consumptions pc
                  JOIN sales s ON pc.sale_id = s.id
                  WHERE pc.package_id IN (${pkgIds.map(id => `'${id}'`).join(',')})`
      });
      console.log("HISTORICAL CONSUMPTION RECORDS:", JSON.stringify(cons, null, 2));
  } else {
      console.log("No packages, so no consumptions.");
  }

  // 3. All sales of Type 03 for TM
  const { data: sales03 } = await s.rpc('exec_sql', {
      query: `SELECT s.id, si.quantity, s.created_at, s.observations
              FROM sales s
              JOIN sale_items si ON s.id = si.sale_id
              WHERE s.client_id = '${tmId}' AND si.sale_type = '03'`
  });
  console.log("TYPE 03 SALES (TM as Client):", JSON.stringify(sales03, null, 2));
  
  // 4. Check if any package_consumptions exist for these sales03 IDs
  if (sales03 && sales03.length > 0) {
      const saleIds = sales03.map(s => s.id);
      const { data: consBySale } = await s.rpc('exec_sql', {
          query: `SELECT * FROM package_consumptions WHERE sale_id IN (${saleIds.map(id => `'${id}'`).join(',')})`
      });
      console.log("RECORDS IN package_consumptions LINKED TO SALES 03:", JSON.stringify(consBySale, null, 2));
  }
}
deep();
