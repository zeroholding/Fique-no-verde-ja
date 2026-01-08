const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectPackages() {
  const { data, error } = await supabase
    .from('client_packages')
    .select('*')
    .limit(1);

  if (error) { console.error(error); return; }
  console.log("Colunas client_packages:", Object.keys(data[0] || {}));
}

inspectPackages();
