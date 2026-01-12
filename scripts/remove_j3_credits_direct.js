const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function removeCreditsDirect() {
  console.log("=== REMOÇÃO DIRETA DE CRÉDITOS (MANUAL) - CLIENTE J3 ===\n");

  // 1. Get Client ID
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .ilike('name', '%J3%')
    .limit(1);
    
  if (!clients?.length) return console.log("Cliente J3 não encontrado.");
  const client = clients[0];
  console.log(`Cliente: ${client.name} (${client.id})`);

  // 2. Find the active package with most credits to deduct from
  // We look for 'client_packages' for this client
  const { data: packages, error } = await supabase
    .from('client_packages')
    .select('*')
    .eq('client_id', client.id)
    .gt('available_quantity', 0)
    .order('available_quantity', { ascending: false }) // Take the biggest one
    .limit(1);

  if (error) {
    console.error("Erro ao buscar pacotes:", error);
    return;
  }

  if (!packages || packages.length === 0) {
    console.log("Nenhum pacote com saldo positivo encontrado para deduzir.");
    // Fallback: try to find ANY package to make negative if requested "nem que fique negativo"
    // But usually we prefer modifying the latest active one.
    return;
  }

  const targetPkg = packages[0];
  console.log(`\nPacote Alvo Encontrado: ${targetPkg.id}`);
  console.log(`Saldo Atual: ${targetPkg.available_quantity}`);
  console.log(`Saldo Original: ${targetPkg.initial_quantity}`);

  const deduction = 1000;
  const newBalance = targetPkg.available_quantity - deduction;

  console.log(`\n>> REMOVENDO ${deduction} CRÉDITOS...`);
  console.log(`>> Novo Saldo será: ${newBalance}`);

  // 3. Update the package directly
  const { error: updateError } = await supabase
    .from('client_packages')
    .update({ available_quantity: newBalance })
    .eq('id', targetPkg.id);

  if (updateError) {
    console.error("Erro ao atualizar saldo:", updateError);
  } else {
    console.log("\n✅ SUCESSO: Saldo atualizado diretamente no banco.");
  }
}

removeCreditsDirect();
