const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectSale() {
  const saleId = 'd182ddc5-1ce9-43de-b628-e9e1fd267e86';
  console.log(`Inspecionando Venda ID: ${saleId}`);

  // 1. Dados da Venda
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .select('*')
    .eq('id', saleId)
    .single();

  if (saleError) console.error("Erro venda:", saleError);
  console.log("SALE DATA:", sale);

  // 2. Itens da Venda
  const { data: items, error: itemsError } = await supabase
    .from('sale_items')
    .select('*')
    .eq('sale_id', saleId);

  if (itemsError) console.error("Erro itens:", itemsError);
  console.log("ITEMS DATA:", items);
}

inspectSale();
