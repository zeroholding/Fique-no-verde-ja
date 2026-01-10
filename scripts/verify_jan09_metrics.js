const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verifyMetrics() {
  console.log("=== VERIFICAÇÃO: 09/01/2026 ===\n");
  
  // BRT is UTC-3, so 09/01/2026 00:00 BRT = 09/01/2026 03:00 UTC
  const startUTC = '2026-01-09T03:00:00.000Z';
  const endUTC = '2026-01-10T02:59:59.999Z';
  
  // 1. Fetch all sales for the day
  const { data: sales, error } = await supabase
    .from('sales')
    .select(`
      id, 
      sale_date, 
      total,
      total_discount,
      refund_total,
      commission_amount,
      sale_items ( subtotal, quantity, sale_type, product_name )
    `)
    .neq('status', 'cancelada')
    .gte('sale_date', startUTC)
    .lte('sale_date', endUTC);
    
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  console.log(`Total de Vendas (Atendimentos): ${sales.length}`);
  
  let totalSubtotal = 0;
  let totalUnits = 0;
  let reclamacoes = 0;
  let atrasos = 0;
  let totalDiscount = 0;
  let totalCommission = 0;
  
  for (const sale of sales) {
    const items = sale.sale_items || [];
    for (const item of items) {
      totalSubtotal += item.subtotal || 0;
      totalUnits += item.quantity || 0;
      const nameLower = (item.product_name || '').toLowerCase();
      if (nameLower.includes('reclam')) reclamacoes += item.quantity || 0;
      if (nameLower.includes('atras')) atrasos += item.quantity || 0;
    }
    totalDiscount += sale.total_discount || 0;
    totalCommission += sale.commission_amount || 0;
  }
  
  console.log(`\n--- ESPERADO (calculado do DB) ---`);
  console.log(`Receita Bruta (SUM subtotal): R$ ${totalSubtotal.toFixed(2)}`);
  console.log(`Descontos (SUM total_discount): R$ ${totalDiscount.toFixed(2)}`);
  console.log(`Receita Líquida (Bruta - Descontos): R$ ${(totalSubtotal - totalDiscount).toFixed(2)}`);
  console.log(`Remoções (Unidades): ${totalUnits}`);
  console.log(`Reclamações (Unidades com 'reclam'): ${reclamacoes}`);
  console.log(`Atrasos (Unidades com 'atras'): ${atrasos}`);
  console.log(`Comissão (SUM commission_amount): R$ ${totalCommission.toFixed(2)}`);
  
  console.log(`\n--- DASHBOARD MOSTRA ---`);
  console.log(`Receita Bruta: R$ 15.267,91`);
  console.log(`Descontos: R$ 3.370,00`);
  console.log(`Receita Líquida: R$ 11.897,91`);
  console.log(`Atendimentos: 49`);
  console.log(`Reclamações: 1, Atrasos: 1140`);
  console.log(`Comissão: R$ 207,63`);
}

verifyMetrics();
