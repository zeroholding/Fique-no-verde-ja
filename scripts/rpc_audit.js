
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runQuery(sql) {
  const { data, error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) throw error;
  return data;
}

async function audit() {
  try {
    console.log("--- AUDIT START (via RPC) ---");

    // 1. Last 3 sales
    const sales = await runQuery(`
      SELECT s.id, s.total, c.name as client_name, s.created_at, s.observations
      FROM sales s
      JOIN clients c ON s.client_id = c.id
      ORDER BY s.created_at DESC
      LIMIT 3
    `);
    console.log("RECENT SALES:");
    console.table(sales);

    for (const sale of sales) {
        console.log(`\nChecking Sale: ${sale.id} (${sale.client_name})`);
        
        // 2. Items for this sale
        const items = await runQuery(`SELECT id, product_name, quantity, sale_type FROM sale_items WHERE sale_id = '${sale.id}'`);
        console.table(items);

        // 3. Consumptions for this sale
        const consumptions = await runQuery(`
            SELECT pc.*, cp.client_id as pkg_owner_id, c.name as pkg_owner_name
            FROM package_consumptions pc
            JOIN client_packages cp ON pc.package_id = cp.id
            JOIN clients c ON cp.client_id = c.id
            WHERE pc.sale_id = '${sale.id}'
        `);
        
        if (consumptions && consumptions.length > 0) {
            console.log("CONSUMPTIONS:");
            console.table(consumptions);
        } else {
            console.log("!! NO CONSUMPTIONS FOUND !!");
        }
    }

    // 4. Check J3 package specifically
    const j3Packages = await runQuery(`
        SELECT cp.id, c.name, cp.available_quantity, cp.consumed_quantity
        FROM client_packages cp
        JOIN clients c ON cp.client_id = c.id
        WHERE c.name ILIKE '%J3%'
    `);
    console.log("\nJ3 WALLET STATUS:");
    console.table(j3Packages);

  } catch (err) {
    console.error("Audit Error:", err);
  }
}

audit();
