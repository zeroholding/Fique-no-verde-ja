const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkNullability() {
  // Check count of items with NULL sale_type
  const { count: nullCount, error: nullErr } = await supabase
    .from('sale_items')
    .select('*', { count: 'exact', head: true })
    .is('sale_type', null);

  // Check count of items with sale_type = '01'
  const { count: type01Count, error: type01Err } = await supabase
    .from('sale_items')
    .select('*', { count: 'exact', head: true })
    .eq('sale_type', '01');
    
  // Check count of items with sale_type = '02'
  const { count: type02Count, error: type02Err } = await supabase
    .from('sale_items')
    .select('*', { count: 'exact', head: true })
    .eq('sale_type', '02');

  console.log("Stats:");
  console.log("NULL sale_type:", nullCount);
  console.log("'01' sale_type:", type01Count);
  console.log("'02' sale_type:", type02Count);
  
  // Sample a few NULLs to see what they are
  const { data: sampleNulls } = await supabase
    .from('sale_items')
    .select('id, product_name, sales(sale_date)')
    .is('sale_type', null)
    .limit(3);
    
  console.log("Sample NULLs:", sampleNulls);
}

checkNullability();
