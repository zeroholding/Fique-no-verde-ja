
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function audit() {
  console.log("Auditing latest sales for date offsets...");
  
  const { data: sales, error } = await s
    .from('sales')
    .select('id, sale_date, created_at, observations, client_id')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error(error);
    return;
  }

  console.log(JSON.stringify(sales, null, 2));
}

audit();
