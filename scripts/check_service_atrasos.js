const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkService() {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .ilike('name', '%Atrasos%');

  if (error) console.error(error);
  console.log("Services matching 'Atrasos':", data);
}

checkService();
