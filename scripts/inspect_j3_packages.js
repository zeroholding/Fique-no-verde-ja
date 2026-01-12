const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectJ3Packages() {
  console.log("=== INSPEÇÃO DETALHADA PACOTES J3 ===\n");
  
  const { data: clients } = await supabase
    .from('clients')
    .select('id')
    .ilike('name', '%J3%')
    .limit(1);
    
  if (!clients?.length) return console.log("J3 não encontrado");
  const clientId = clients[0].id;

  const { data: packages } = await supabase
    .from('client_packages')
    .select('*')
    .eq('client_id', clientId);

  console.log(`Total de registros de pacote: ${packages?.length}`);
  
  let totalCalculated = 0;
  
  packages?.forEach(p => {
    console.log(`ID: ${p.id.slice(0,8)}...`);
    console.log(`  Criado em: ${new Date(p.created_at).toLocaleString()}`);
    console.log(`  Initial: ${p.initial_quantity}`);
    console.log(`  Available (Saldo Banco): ${p.available_quantity}`);
    console.log(`  Active: ${p.is_active}`);
    totalCalculated += p.available_quantity;
    console.log('---');
  });
  
  console.log(`\nSOMA DOS SALDOS NO BANCO: ${totalCalculated}`);
}

inspectJ3Packages();
