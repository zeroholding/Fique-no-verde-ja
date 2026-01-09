const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectCorrectedSale() {
  const saleId = '230ad7a6-b5c2-4ed7-bee9-ec56cc22f4ad';
  
  // 1. Fetch Sale
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .select('*')
    .eq('id', saleId)
    .single();
    
  if (saleError) console.error("Sale Error:", saleError);
  console.log("SALE:", sale);

  // 2. Fetch Items
  const { data: items, error: itemError } = await supabase
    .from('sale_items')
    .select('*')
    .eq('sale_id', saleId);

  if (itemError) console.error("Item Error:", itemError);
  console.log("ITEMS:", items);
}

inspectCorrectedSale();
