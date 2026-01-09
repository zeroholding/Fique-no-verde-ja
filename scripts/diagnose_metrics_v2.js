const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function diagnoseMetricsFix() {
  console.log("=== DIAGNOSTICO COMPLETO ===\n");
  
  // 1. Check total sales and items
  const { count: salesCount } = await supabase
    .from('sales')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'cancelada');
    
  const { count: itemsCount } = await supabase
    .from('sale_items')
    .select('*', { count: 'exact', head: true });
    
  console.log(`Total Vendas (não canceladas): ${salesCount}`);
  console.log(`Total Itens: ${itemsCount}`);
  
  // 2. Check date range
  const { data: oldestSale } = await supabase
    .from('sales')
    .select('sale_date')
    .order('sale_date', { ascending: true })
    .limit(1);
    
  const { data: newestSale } = await supabase
    .from('sales')
    .select('sale_date')
    .order('sale_date', { ascending: false })
    .limit(1);
    
  console.log(`\nPrimeira venda: ${oldestSale?.[0]?.sale_date}`);
  console.log(`Última venda: ${newestSale?.[0]?.sale_date}`);
  
  // 3. Calculate what the dashboard SHOULD show for last 180 days
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 180);
  console.log(`\nPeríodo: ${startDate.toISOString().split('T')[0]} até AGORA`);
  
  const { data: salesIn180 } = await supabase
    .from('sales')
    .select('id')
    .neq('status', 'cancelada')
    .gte('sale_date', startDate.toISOString());
    
  console.log(`Vendas nos últimos 180 dias: ${salesIn180?.length}`);
  
  if (salesIn180 && salesIn180.length > 0) {
    const saleIds = salesIn180.map(s => s.id);
    
    // Get items for these sales
    const { data: items } = await supabase
      .from('sale_items')
      .select('subtotal, quantity')
      .in('sale_id', saleIds);
      
    if (items && items.length > 0) {
      const totalSubtotal = items.reduce((sum, i) => sum + (i.subtotal || 0), 0);
      const totalQty = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
      console.log(`\nItens encontrados: ${items.length}`);
      console.log(`RECEITA BRUTA ESPERADA: R$ ${totalSubtotal.toFixed(2)}`);
      console.log(`UNIDADES ESPERADAS: ${totalQty}`);
    } else {
      console.log("\n!!! PROBLEMA: Vendas existem mas NÃO TÊM ITENS !!!");
    }
  }
  
  // 4. Check if LEFT JOIN in API might be the issue
  console.log("\n--- Verificando JOINs ---");
  
  // Find sales WITHOUT items
  const { data: salesWithoutItems } = await supabase
    .from('sales')
    .select('id')
    .is('sale_items', null);
    
  console.log(`Vendas SEM itens (LEFT JOIN problem): ${salesWithoutItems?.length || 'N/A (query may not work this way)'}`);
  
  // Alternative: RPC or manual check
  const { data: orphanCheck } = await supabase
    .from('sales')
    .select('id')
    .neq('status', 'cancelada')
    .limit(10);
    
  if (orphanCheck) {
    for (const sale of orphanCheck.slice(0, 3)) {
      const { data: items } = await supabase
        .from('sale_items')
        .select('id')
        .eq('sale_id', sale.id);
      console.log(`Venda ${sale.id.slice(0,8)}: ${items?.length || 0} itens`);
    }
  }
  
  console.log("\n=== FIM ===");
}

diagnoseMetricsFix();
