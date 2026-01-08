const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkPackagesJoin() {
  console.log("Verificando pacotes do serviço 'Reclamação'...");

  // Select packages joined with services
  const { data, error } = await supabase
    .from('client_packages')
    .select(`
      id,
      available_quantity,
      service_id,
      services (
        name
      )
    `)
    // Filter by joining manually or using inner filter if supported
    // Let's filter in JS to be safe against schema quirks
    .gt('available_quantity', -9999); // Dummy filter to get all

  if (error) { console.error(error); return; }

  const reclamacaoPackages = data.filter(p => p.services && p.services.name.toLowerCase().includes('reclama'));

  console.log(`Pacotes 'Reclamação' encontrados: ${reclamacaoPackages.length}`);
  if (reclamacaoPackages.length > 0) {
    console.log("Exemplos:", reclamacaoPackages.slice(0, 3));
  }
}

checkPackagesJoin();
