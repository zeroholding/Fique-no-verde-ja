const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function debugSql() {
  const startDate = '2026-01-09';
  const endDate = '2026-01-09';
  
  // 1. Test Date Logic
  console.log("Testing Date Logic...");
  const { data: dateData, error: dateError } = await supabase.rpc('debug_sales_date', {}); 
  // Since I can't create RPC easily, I will use raw query via a trick or check specific sales
  
  // Check exact sale_date of a known sale
  const knownId = 'd182ddc5-1ce9-43de-b628-e9e1fd267e86';
  const { data: sale } = await supabase.from('sales').select('sale_date').eq('id', knownId).single();
  console.log(`Known Sale Date (UTC): ${sale.sale_date}`);
  
  // 2. Check sale_type of known sale items
  const { data: items } = await supabase.from('sale_items').select('sale_type').eq('sale_id', knownId);
  console.log(`Known Sale Items Type:`, items);

  // 3. Re-Verify sale_type != '02' Logic in a select
  // We will fetch ALL items filtering by logic
  const { count } = await supabase
    .from('sale_items')
    .select('*', { count: 'exact', head: true })
    .neq('sale_type', '02');
  console.log("Count of items != '02':", count);

}

debugSql();
