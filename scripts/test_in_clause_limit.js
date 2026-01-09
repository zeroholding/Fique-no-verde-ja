const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testInClauseLimit() {
  console.log("=== TESTANDO LIMITE DO IN() ===\n");
  
  // Get 1617 sales (the count from the diagnostic)
  const { data: allSales } = await supabase
    .from('sales')
    .select('id')
    .neq('status', 'cancelada')
    .limit(2000);
    
  if (!allSales) {
    console.log("Erro ao buscar vendas");
    return;
  }
  
  console.log(`Total de IDs coletados: ${allSales.length}`);
  
  // Test with different chunk sizes
  const testSizes = [10, 100, 500, 1000, allSales.length];
  
  for (const size of testSizes) {
    const sampleIds = allSales.slice(0, size).map(s => s.id);
    
    const { data: items, error } = await supabase
      .from('sale_items')
      .select('id')
      .in('sale_id', sampleIds);
      
    if (error) {
      console.log(`Tamanho ${size}: ERRO - ${error.message}`);
    } else {
      console.log(`Tamanho ${size}: ${items?.length || 0} itens encontrados`);
    }
  }
  
  console.log("\n=== FIM TESTE ===");
}

testInClauseLimit();
