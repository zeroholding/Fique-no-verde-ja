const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findSpecificSale() {
  console.log("=== Buscando Venda Específica J3 (Hoje) ===\n");
  
  // 1. Get Client ID
  const { data: clients } = await supabase
    .from('clients')
    .select('id')
    .ilike('name', '%J3%')
    .limit(1);
    
  if (!clients?.length) return console.log("Cliente J3 não encontrado.");
  const clientId = clients[0].id;
  
  // 2. Search Sales
  // Today in BRT: 2026-01-12. UTC range approx 03:00 to 03:00+1
  const startUTC = '2026-01-12T03:00:00.000Z';
  
  const { data: sales, error } = await supabase
    .from('sales')
    .select(`
      id,
      sale_date,
      total,
      status,
      sale_items (
        product_name,
        quantity,
        subtotal
      )
    `)
    .eq('client_id', clientId)
    .eq('client_id', clientId)
    .order('sale_date', { ascending: false })
    .limit(10);
    
  if (error) console.error(error);
  
  console.log(`Encontradas ${sales?.length} vendas hoje para J3:\n`);
  
  sales?.forEach(s => {
    console.log(`ID: ${s.id}`);
    console.log(`Data: ${new Date(s.sale_date).toLocaleString('pt-BR')}`);
    console.log(`Total: R$ ${s.total}`);
    console.log(`Status: ${s.status}`);
    console.log(`Itens:`);
    s.sale_items.forEach(i => {
      console.log(`  - ${i.product_name}: Qtd ${i.quantity}, Sub ${i.subtotal}`);
    });
    console.log('---');
  });
}

findSpecificSale();
