const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deleteProblemSales() {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 180);
  
  // Buscar vendas problemáticas
  const { data: sales, error: fetchError } = await supabase
    .from('sales')
    .select('id, status, total, total_discount, sale_date')
    .gte('sale_date', startDate.toISOString().split('T')[0])
    .order('total_discount', { ascending: false });

  if (fetchError) {
    console.error('Erro ao buscar vendas:', fetchError);
    return;
  }

  const problemSales = sales.filter(s => 
    s.status !== 'cancelada' && s.total_discount > s.total
  );

  const idsToDelete = problemSales.map(s => s.id);

  console.log(`Excluindo ${idsToDelete.length} vendas...\n`);

  // 1. Buscar pacotes vinculados a essas vendas
  const { data: packages } = await supabase
    .from('client_packages')
    .select('id')
    .in('sale_id', idsToDelete);

  const packageIds = packages ? packages.map(p => p.id) : [];

  if (packageIds.length > 0) {
    // 1a. Excluir consumos de pacotes
    const { error: consumptionsError } = await supabase
      .from('package_consumptions')
      .delete()
      .in('package_id', packageIds);

    if (consumptionsError) {
      console.error('Erro ao excluir consumos:', consumptionsError);
      return;
    }

    console.log(`✓ ${packageIds.length} consumos de pacotes excluídos`);
  }

  // 2. Excluir pacotes de clientes vinculados
  const { error: packagesError } = await supabase
    .from('client_packages')
    .delete()
    .in('sale_id', idsToDelete);

  if (packagesError) {
    console.error('Erro ao excluir pacotes:', packagesError);
    return;
  }

  console.log('✓ Pacotes de clientes excluídos');

  // 3. Excluir os itens das vendas
  const { error: itemsError } = await supabase
    .from('sale_items')
    .delete()
    .in('sale_id', idsToDelete);

  if (itemsError) {
    console.error('Erro ao excluir itens:', itemsError);
    return;
  }

  console.log('✓ Itens das vendas excluídos');

  // 4. Excluir as vendas
  const { error: salesError } = await supabase
    .from('sales')
    .delete()
    .in('id', idsToDelete);

  if (salesError) {
    console.error('Erro ao excluir vendas:', salesError);
    return;
  }

  console.log('✓ Vendas excluídas');
  console.log(`\n✅ ${idsToDelete.length} vendas de teste removidas com sucesso!`);
}

deleteProblemSales();
