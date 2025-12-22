
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkItems() {
  const { data: items } = await s.rpc('exec_sql', { 
    query: `SELECT * FROM sale_items WHERE sale_id IN ('fcb3162c-0752-4f0c-9697-11097c066f92', '5505c766-f754-47c6-b3de-26bfc7a7289c')` 
  });
  console.log("SALE ITEMS:", JSON.stringify(items, null, 2));
}
checkItems();
