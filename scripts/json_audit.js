
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const result = { sales: [], consumers: [], package: null };
  try {
    const { data: sales } = await supabase.rpc('exec_sql', { query: "SELECT s.id, s.total, c.name FROM sales s JOIN clients c ON s.client_id = c.id ORDER BY s.created_at DESC LIMIT 2" });
    result.sales = sales;

    if (sales && sales.length > 0) {
      const { data: items } = await supabase.rpc('exec_sql', { query: `SELECT sale_id, sale_type, quantity FROM sale_items WHERE sale_id IN ('${sales.map(s => s.id).join("','")}')` });
      result.items = items;

      const { data: cons } = await supabase.rpc('exec_sql', { query: `SELECT * FROM package_consumptions WHERE sale_id IN ('${sales.map(s => s.id).join("','")}')` });
      result.consumers = cons;
    }

    const { data: pkg } = await supabase.rpc('exec_sql', { query: "SELECT cp.id, cp.available_quantity, c.name FROM client_packages cp JOIN clients c ON cp.client_id = c.id WHERE c.name ILIKE '%J3%'" });
    result.package = pkg;

    console.log("---JSON_START---");
    console.log(JSON.stringify(result));
    console.log("---JSON_END---");
  } catch (e) {
    console.log("ERROR:" + e.message);
  }
}
run();
