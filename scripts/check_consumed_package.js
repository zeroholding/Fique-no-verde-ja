const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkPackage() {
  const pkgId = '34a09211-0d10-4dcb-9c07-c68d6ec965c1';
  
  const { data, error } = await supabase
    .from('client_packages')
    .select('id, service_id, initial_quantity, available_quantity, services(name)')
    .eq('id', pkgId)
    .single();

  if (error) console.error(error);
  console.log("Consumed Package Data:", data);
}

checkPackage();
