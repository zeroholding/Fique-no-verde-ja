
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findGhostSales() {
  console.log("Searching for Ghost Type 02 sales...");
  const { data: sales } = await s.rpc('exec_sql', { 
    query: `SELECT si.quantity, c.name, s.id as sale_id, s.created_at, s.observations
            FROM sale_items si 
            JOIN sales s ON si.sale_id = s.id 
            JOIN clients c ON s.client_id = c.id 
            WHERE si.sale_type = '02' AND si.quantity > 500`
  });
  console.log("Large Type 02 Sales:", JSON.stringify(sales, null, 2));

  const { data: allPkgs } = await s.rpc('exec_sql', {
      query: `SELECT cp.id, cp.initial_quantity, cp.available_quantity, c.name as client_name, cp.sale_id
              FROM client_packages cp
              JOIN clients c ON cp.client_id = c.id
              WHERE cp.initial_quantity > 500`
  });
  console.log("\nLarge Packages:", JSON.stringify(allPkgs, null, 2));
}
findGhostSales();
