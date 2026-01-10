const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function debugTodayData() {
  console.log("=== DEBUG: Por que o Dashboard está zerado? ===\n");
  
  const startUTC = '2026-01-09T03:00:00.000Z';
  const endUTC = '2026-01-10T02:59:59.999Z';
  
  // 1. Check total sales today
  const { count: totalSales } = await supabase
    .from('sales')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'cancelada')
    .gte('sale_date', startUTC)
    .lte('sale_date', endUTC);
    
  console.log(`[1] Total de vendas hoje (09/01): ${totalSales}`);
  
  // 2. Check sales with Type 01 or 03 items
  const { data: salesWithItems } = await supabase
    .from('sales')
    .select(`
      id,
      sale_items!inner ( sale_type )
    `)
    .neq('status', 'cancelada')
    .gte('sale_date', startUTC)
    .lte('sale_date', endUTC)
    .neq('sale_items.sale_type', '02');
    
  console.log(`[2] Vendas com itens tipo != 02: ${salesWithItems?.length}`);
  
  // 3. Check sale_type distribution for today
  const { data: typeDistribution } = await supabase
    .from('sales')
    .select(`
      id,
      sale_items ( sale_type )
    `)
    .neq('status', 'cancelada')
    .gte('sale_date', startUTC)
    .lte('sale_date', endUTC);
    
  const type01 = new Set();
  const type02 = new Set();
  const type03 = new Set();
  
  typeDistribution?.forEach(sale => {
    sale.sale_items?.forEach(item => {
      if (item.sale_type === '01') type01.add(sale.id);
      if (item.sale_type === '02') type02.add(sale.id);
      if (item.sale_type === '03') type03.add(sale.id);
    });
  });
  
  console.log(`\n[3] Distribuição de tipos de venda hoje:`);
  console.log(`   Tipo 01 (Venda Comum): ${type01.size} vendas`);
  console.log(`   Tipo 02 (Venda Pacote): ${type02.size} vendas`);
  console.log(`   Tipo 03 (Consumo Pacote): ${type03.size} vendas`);
  
  // 4. Check one sample sale's items
  if (typeDistribution && typeDistribution.length > 0) {
    const sample = typeDistribution[0];
    console.log(`\n[4] Amostra - Venda ${sample.id.slice(0,8)}:`);
    console.log(`   Itens:`, sample.sale_items);
  }
  
  // 5. Verify JOIN behavior
  console.log(`\n[5] Verificando se JOIN está excluindo vendas...`);
  
  // Sales that have items
  const { count: salesWithAnyItems } = await supabase
    .from('sales')
    .select('*, sale_items!inner(*)', { count: 'exact', head: true })
    .neq('status', 'cancelada')
    .gte('sale_date', startUTC)
    .lte('sale_date', endUTC);
    
  console.log(`   Vendas com QUALQUER item: ${salesWithAnyItems}`);
  
  // Sales that have items != 02
  const { count: salesWithNon02Items } = await supabase
    .from('sales')
    .select('*, sale_items!inner(*)', { count: 'exact', head: true })
    .neq('status', 'cancelada')
    .gte('sale_date', startUTC)
    .lte('sale_date', endUTC)
    .neq('sale_items.sale_type', '02');
    
  console.log(`   Vendas com item tipo != 02: ${salesWithNon02Items}`);
}

debugTodayData();
