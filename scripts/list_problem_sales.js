const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function listProblemSales() {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 180);
  
  const { data, error } = await supabase
    .from('sales')
    .select('id, status, total, total_discount, sale_date, created_at')
    .gte('sale_date', startDate.toISOString().split('T')[0])
    .order('total_discount', { ascending: false });

  if (error) {
    console.error('Erro:', error);
    return;
  }

  const problemSales = data.filter(s => 
    s.status !== 'cancelada' && s.total_discount > s.total
  );

  console.log('=== VENDAS QUE SERÃO EXCLUÍDAS ===\n');
  
  problemSales.forEach((s, i) => {
    console.log(`${i+1}. ID: ${s.id}`);
    console.log(`   Data da venda: ${new Date(s.sale_date).toLocaleDateString('pt-BR')}`);
    console.log(`   Data de criação: ${new Date(s.created_at).toLocaleDateString('pt-BR')} às ${new Date(s.created_at).toLocaleTimeString('pt-BR')}`);
    console.log(`   Status: ${s.status}`);
    console.log(`   Total: R$ ${s.total.toFixed(2)}`);
    console.log(`   Desconto: R$ ${s.total_discount.toFixed(2)}`);
    console.log('');
  });

  console.log(`Total a excluir: ${problemSales.length} vendas`);
}

listProblemSales();
