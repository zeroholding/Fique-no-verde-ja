const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Simulate exact API parameters for user "Gianlucca" (Admin, 180 days, All Services, All Attendants)
async function diagnoseMetrics() {
  const userId = '51cbe1f7-0c68-47e0-a565-1ad4aa09f680'; // Gianlucca
  const periodDays = 180;
  const isAdmin = true;
  const adminAttendantId = null; // "Todos os atendentes"

  console.log("=== DIAGNOSTICO API METRICAS ===");
  console.log(`User: ${userId}, Admin: ${isAdmin}, Period: ${periodDays} days`);
  
  // Step 1: Simulate baseFilterQuery (What the API does)
  // Since admin + no attendantId selected, NO attendant filter applied
  // Since no service filter, NO service filter applied
  // Since no dayType, NO dayType filter applied
  // Since no saleType, NO saleType filter applied
  // Only filter: includePeriod=true, status != cancelada
  
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - periodDays);
  const startDateStr = startDate.toISOString().split('T')[0];
  
  console.log(`\nStep 1: Fetching Sales IDs since ${startDateStr}...`);
  
  const { data: baseSales, error: baseError, count } = await supabase
    .from('sales')
    .select('id', { count: 'exact' })
    .neq('status', 'cancelada')
    .gte('sale_date', `${startDateStr}T00:00:00.000Z`);
    
  if (baseError) {
    console.error("Base Query Error:", baseError);
    return;
  }
  
  console.log(`Found ${baseSales?.length} sales (count: ${count})`);
  
  if (!baseSales || baseSales.length === 0) {
    console.log("\n!!! PROBLEMA: Nenhuma venda encontrada na query base !!!");
    console.log("Verificando se vendas existem sem filtro de data...");
    
    const { count: totalCount } = await supabase
      .from('sales')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'cancelada');
      
    console.log(`Total de vendas não canceladas no banco: ${totalCount}`);
    
    // Check date range of existing sales
    const { data: dateRange } = await supabase
      .from('sales')
      .select('sale_date')
      .neq('status', 'cancelada')
      .order('sale_date', { ascending: true })
      .limit(1);
      
    const { data: latestSale } = await supabase
      .from('sales')
      .select('sale_date')
      .neq('status', 'cancelada')
      .order('sale_date', { ascending: false })
      .limit(1);
      
    console.log(`Primeira Venda: ${dateRange?.[0]?.sale_date}`);
    console.log(`Última Venda: ${latestSale?.[0]?.sale_date}`);
    
    return;
  }
  
  // Step 2: Check if items exist for these sales
  const sampleIds = baseSales.slice(0, 5).map(s => s.id);
  console.log(`\nStep 2: Checking sale_items for sample IDs: ${sampleIds.join(', ')}`);
  
  const { data: items, error: itemError } = await supabase
    .from('sale_items')
    .select('id, sale_id, subtotal, quantity, sale_type')
    .in('sale_id', sampleIds);
    
  if (itemError) {
    console.error("Items Query Error:", itemError);
  }
  
  console.log(`Found ${items?.length} items for sample sales`);
  if (items && items.length > 0) {
    console.log("Sample Items:", items.slice(0, 3));
  } else {
    console.log("\n!!! PROBLEMA: Sales existem mas sale_items NÃO !!!");
  }
  
  // Step 3: Sum totals
  console.log("\nStep 3: Calculating totals...");
  const { data: totals } = await supabase
    .from('sale_items')
    .select('subtotal, quantity')
    .in('sale_id', baseSales.map(s => s.id));
    
  if (totals && totals.length > 0) {
    const sum = totals.reduce((acc, t) => acc + (t.subtotal || 0), 0);
    const units = totals.reduce((acc, t) => acc + (t.quantity || 0), 0);
    console.log(`Total Subtotal (Receita Bruta): R$ ${sum.toFixed(2)}`);
    console.log(`Total Quantity (Unidades): ${units}`);
  } else {
    console.log("Nenhum item para somar.");
  }
  
  console.log("\n=== FIM DIAGNOSTICO ===");
}

diagnoseMetrics();
