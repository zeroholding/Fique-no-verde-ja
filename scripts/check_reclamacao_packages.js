const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkPackages() {
  console.log("Verificando pacotes com nome de serviço 'Reclamação'...");

  // query client_packages (active balances)
  // Assuming table name is client_packages or similar, based on previous context.
  // Actually, let's inspect the `client_packages` view or table. Use `inspect_schema.js` if unsure, 
  // but previously `app/dashboard/sales/page.tsx` fetched from `/api/packages`.
  // Let's assume table `client_packages` or `packages`? 
  // Usually `sales` Type 02 create credits in a `client_packages` table/view.
  
  const { data, error } = await supabase
    .from('client_packages')
    .select('*')
    .ilike('service_name', '%Reclama%');

  if (error) {
    console.error("Erro ao buscar pacotes:", error);
    return;
  }

  console.log(`Pacotes 'Reclamação' encontrados: ${data.length}`);
  if (data.length > 0) {
    console.table(data);
  }
}

checkPackages();
