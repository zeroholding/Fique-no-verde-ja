const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkJ3Credits() {
  console.log("=== Verificando Créditos do Cliente J3 ===\n");

  // 1. Find client ID for 'J3'
  const { data: clients, error: clientError } = await supabase
    .from('clients')
    .select('id, name')
    .ilike('name', '%J3%')
    .limit(1);

  if (clientError || !clients.length) {
    console.error("Cliente J3 não encontrado ou erro:", clientError);
    return;
  }

  const client = clients[0];
  console.log(`Cliente encontrado: ${client.name} (ID: ${client.id})`);

  // 2. Buscando compras de pacotes recentes
  const { data: packages, error: pkgError } = await supabase
    .from('client_packages')
    .select(`
      id,
      initial_quantity,
      available_quantity,
      total_paid,
      created_at,
      sale_id,
      sales (
        id,
        status,
        total,
        sale_date
      )
    `)
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (pkgError) {
    console.error("Erro ao buscar pacotes:", pkgError);
    return;
  }

  console.log(`\nÚltimas 5 compras de pacotes para ${client.name}:`);
  packages.forEach(pkg => {
    const sale = pkg.sales;
    console.log(`--------------------------------------------------`);
    console.log(`Data: ${new Date(pkg.created_at).toLocaleString('pt-BR')}`);
    console.log(`Qtd Inicial: ${pkg.initial_quantity}`);
    console.log(`Valor Pago: R$ ${pkg.total_paid}`);
    console.log(`Status da Venda: ${sale ? sale.status : 'N/A'}`);
    console.log(`ID da Venda: ${pkg.sale_id}`);
    
    if (pkg.initial_quantity === 1000 || pkg.initial_quantity === 500) { // Checking mostly for the requested approx amount or what user meant
        console.log(">> PROVAVEL ALVO <<");
    }
  });

}

checkJ3Credits();
