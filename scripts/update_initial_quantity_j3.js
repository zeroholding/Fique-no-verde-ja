const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function updateInitialQuantity() {
  console.log("=== CORREÇÃO: ATUALIZANDO QUANTIDADE INICIAL ===\n");

  const { data: clients } = await supabase
    .from('clients')
    .select('id')
    .ilike('name', '%J3%')
    .limit(1);
    
  if (!clients?.length) return;
  const clientId = clients[0].id;

  // Obter o pacote alvo
  const { data: packages } = await supabase
    .from('client_packages')
    .select('*')
    .eq('client_id', clientId)
    .limit(1);
    
  if (!packages?.length) return;
  const pkg = packages[0];
  
  console.log(`Pacote: ${pkg.id}`);
  console.log(`Qtd Inicial Antiga: ${pkg.initial_quantity}`);
  
  const newInitial = pkg.initial_quantity - 1000;
  
  console.log(`>> NOVA Qtd Inicial: ${newInitial}`);
  
  const { error } = await supabase
    .from('client_packages')
    .update({ initial_quantity: newInitial })
    .eq('id', pkg.id);
    
  if (error) console.error(error);
  else console.log("✅ Qtd Inicial atualizada! O recálculo da Dashboard agora deve bater.");
}

updateInitialQuantity();
