const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function investigate() {
  console.log("Investigando RAW Type 03 vendas...");

  // 1. Pegar IDs de vendas tipo 03
  const { data: sales, error: salesError } = await supabase
    .from('sales')
    .select('id, sale_date')
    .eq('sale_type', '03')
    .limit(200);

  if (salesError) { console.error(salesError); return; }
  console.log(`Vendas Tipo 03 encontradas (amostra 200): ${sales.length}`);
  
  const saleIds = sales.map(s => s.id);

  // 2. Ver itens dessas vendas
  const { data: items, error: itemsError } = await supabase
    .from('sale_items')
    .select('id, sale_id, product_name')
    .in('sale_id', saleIds);

  if (itemsError) { console.error(itemsError); return; }

  // 3. Contar produtos
  const counts = {};
  items.forEach(item => {
    const name = item.product_name || "SEM NOME";
    counts[name] = (counts[name] || 0) + 1;
  });

  console.log("\nContagem de nomes de produtos em Vendas Tipo 03:");
  console.table(counts);
}

investigate();
