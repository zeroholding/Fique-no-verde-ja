const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verifyExcludingType02() {
  console.log("=== VERIFICAÇÃO: 09/01/2026 (SEM TIPO 02) ===\n");
  
  const startUTC = '2026-01-09T03:00:00.000Z';
  const endUTC = '2026-01-10T02:59:59.999Z';
  
  // Fetch sales with Type 01 and 03 only
  const { data: sales, error } = await supabase
    .from('sales')
    .select(`
      id, 
      sale_date, 
      total,
      total_discount,
      commission_amount,
      sale_items!inner ( subtotal, quantity, sale_type, product_name )
    `)
    .neq('status', 'cancelada')
    .gte('sale_date', startUTC)
    .lte('sale_date', endUTC)
    .neq('sale_items.sale_type', '02'); // Exclude Type 02
    
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  console.log(`Total de Vendas (Atendimentos excluindo Tipo 02): ${sales.length}`);
  
  let totalSubtotal = 0;
  let totalUnits = 0;
  let reclamacoes = 0;
  let atrasos = 0;
  let totalDiscount = 0;
  let totalCommission = 0;
  let type01Count = 0;
  let type03Count = 0;
  
  for (const sale of sales) {
    const items = sale.sale_items || [];
    for (const item of items) {
      if (item.sale_type === '01') type01Count++;
      if (item.sale_type === '03') type03Count++;
      totalSubtotal += item.subtotal || 0;
      totalUnits += item.quantity || 0;
      const nameLower = (item.product_name || '').toLowerCase();
      if (nameLower.includes('reclam')) reclamacoes += item.quantity || 0;
      if (nameLower.includes('atras')) atrasos += item.quantity || 0;
    }
    totalDiscount += sale.total_discount || 0;
    totalCommission += sale.commission_amount || 0;
  }
  
  console.log(`\n--- BREAKDOWN POR TIPO ---`);
  console.log(`Itens Tipo 01 (Venda Comum): ${type01Count}`);
  console.log(`Itens Tipo 03 (Consumo Pacote): ${type03Count}`);
  
  console.log(`\n--- VALORES ESPERADOS (SEM TIPO 02) ---`);
  console.log(`Receita Bruta: R$ ${totalSubtotal.toFixed(2)}`);
  console.log(`Descontos: R$ ${totalDiscount.toFixed(2)}`);
  console.log(`Receita Líquida: R$ ${(totalSubtotal - totalDiscount).toFixed(2)}`);
  console.log(`Atendimentos: ${sales.length}`);
  console.log(`Unidades (Remoções): ${totalUnits}`);
  console.log(`Reclamações: ${reclamacoes}`);
  console.log(`Atrasos: ${atrasos}`);
  console.log(`Comissão: R$ ${totalCommission.toFixed(2)}`);
}

verifyExcludingType02();
