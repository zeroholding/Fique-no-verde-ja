const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function removeCreditsFinal() {
  console.log("=== REMOÇÃO FINAL DE 1000 CRÉDITOS - J3 ===\n");

  // 1. Get Client
  const { data: clients } = await supabase
    .from('clients')
    .select('id')
    .ilike('name', '%J3%')
    .limit(1);
    
  if (!clients?.length) return console.log("J3 não encontrado");
  const clientId = clients[0].id;

  // 2. Get Active Package
  const { data: packages, error } = await supabase
    .from('client_packages')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .limit(1);

  if (!packages?.length) return console.log("Nenhum pacote ativo encontrado.");
  
  const pkg = packages[0];
  console.log(`Pacote ID: ${pkg.id}`);
  console.log(`Qtd Inicial: ${pkg.initial_quantity}`);
  console.log(`Saldo Disponível: ${pkg.available_quantity}`);

  // 3. Calculate New Values
  const deduction = 1000;
  const newInitial = Number(pkg.initial_quantity) - deduction;
  const newAvailable = Number(pkg.available_quantity) - deduction;
  
  // Optional: Adjust Total Paid? 
  // If we remove 1000 credits, we should logically remove the paid amount corresponding to it to keep unit price sane?
  // User didn't ask for financial adjustment explicitly, but "remove exactly 1k credits".
  // Keeping unit price consistent is good.
  // Unit Price = Total Paid / Initial.
  // We keep Unit Price constant.
  // New Total Paid = New Initial * pkg.unit_price (or recalculate)
  // Let's keep it simple: Just reduce credits as requested.
  // If I don't reduce total_paid, unit price spikes.
  // I will check if I should reduce total_paid.
  // Previous time I didn't update total_paid in one script, but I might have in the 'fix'.
  // I'll stick to updating QUANTITY only as requested "remove 1k credits".
  
  console.log(`\n>> REMOVENDO ${deduction}...`);
  console.log(`>> Novo Inicial: ${newInitial}`);
  console.log(`>> Novo Disponível: ${newAvailable}`);

  const { error: updateError } = await supabase
    .from('client_packages')
    .update({
        initial_quantity: newInitial,
        available_quantity: newAvailable,
        updated_at: new Date()
    })
    .eq('id', pkg.id);
    
  if (updateError) {
      console.error("Erro ao atualizar:", updateError);
  } else {
      console.log("✅ Sucesso! Banco de dados atualizado.");
  }
}

removeCreditsFinal();
