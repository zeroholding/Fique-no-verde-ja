const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function investigateDiscounts() {
  console.log('=== INVESTIGAÇÃO DE DESCONTOS ALTOS ===\n');
  
  // Buscar vendas dos últimos 180 dias
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 180);
  
  const { data: sales, error } = await supabase
    .from('sales')
    .select('id, status, total, total_discount, sale_date, created_at')
    .gte('sale_date', startDate.toISOString().split('T')[0])
    .order('total_discount', { ascending: false });

  if (error) {
    console.error('Erro:', error);
    return;
  }

  console.log(`Total de vendas nos últimos 180 dias: ${sales.length}\n`);

  // Agrupar por status
  const byStatus = {};
  sales.forEach(s => {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  });
  console.log('Vendas por status:');
  console.log(JSON.stringify(byStatus, null, 2));

  // Vendas com desconto maior que o total
  const problemSales = sales.filter(s => 
    s.status !== 'cancelada' && s.total_discount > s.total
  );

  console.log(`\n❌ Vendas com desconto MAIOR que o valor total: ${problemSales.length}\n`);

  if (problemSales.length > 0) {
    console.log('Detalhes das vendas problemáticas:\n');
    problemSales.forEach((s, idx) => {
      const ratio = (s.total_discount / s.total).toFixed(1);
      console.log(`${idx + 1}. ID: ${s.id.substring(0, 8)}...`);
      console.log(`   Status: ${s.status}`);
      console.log(`   Data: ${s.sale_date}`);
      console.log(`   Total: R$ ${s.total.toFixed(2)}`);
      console.log(`   Desconto: R$ ${s.total_discount.toFixed(2)}`);
      console.log(`   Proporção: ${ratio}x o valor da venda`);
      console.log('');
    });
  }

  // Calcular totais
  const confirmedSales = sales.filter(s => s.status !== 'cancelada');
  const totalRevenue = confirmedSales.reduce((acc, s) => acc + s.total, 0);
  const totalDiscount = confirmedSales.reduce((acc, s) => acc + (s.total_discount || 0), 0);
  const netRevenue = totalRevenue - totalDiscount;

  console.log('\n=== RESUMO FINANCEIRO (últimos 180 dias) ===');
  console.log(`Receita Bruta: R$ ${totalRevenue.toFixed(2)}`);
  console.log(`Total Descontos: R$ ${totalDiscount.toFixed(2)}`);
  console.log(`Receita Líquida: R$ ${netRevenue.toFixed(2)}`);
  console.log(`\n⚠️ Diferença: ${totalDiscount > totalRevenue ? 'DESCONTOS MAIORES QUE RECEITA' : 'OK'}`);
}

investigateDiscounts();
