const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSideEffects() {
  const saleId = 'd182ddc5-1ce9-43de-b628-e9e1fd267e86';
  
  // 1. Check Package Consumptions (Type 03 Effect)
  const { data: consumptions, error: consError } = await supabase
    .from('package_consumptions')
    .select('*')
    .eq('sale_id', saleId);
    
  if (consError) console.error("Error consumptions:", consError);
  console.log("CONSUMPTIONS LINKED:", consumptions);

  // 2. Check Client Packages (Type 02 Effect)
  const { data: packages, error: pkgError } = await supabase
    .from('client_packages')
    .select('*')
    .eq('sale_id', saleId);

  if (pkgError) console.error("Error packages:", pkgError);
  console.log("PACKAGES CREATED (Type 02):", packages);
}

checkSideEffects();
