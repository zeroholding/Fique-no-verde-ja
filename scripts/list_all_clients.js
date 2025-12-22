
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function listAll() {
  console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const { data: sales, error } = await s.rpc('exec_sql', { 
    query: `SELECT s.id, c.name as client_name, si.sale_type, si.quantity, s.created_at
            FROM sales s
            JOIN clients c ON s.client_id = c.id
            JOIN sale_items si ON s.id = si.sale_id
            ORDER BY s.created_at DESC` 
  });
  if (error) {
      console.error(error);
      return;
  }
  console.log("Total Sales:", sales.length);
  console.log(JSON.stringify(sales, null, 2));
}
listAll();
