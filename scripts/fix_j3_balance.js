
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixJ3() {
  console.log("Fixing J3 balance...");
  
  const pkgId = '272e7874-c81f-4f40-809c-9b5bfe0b40b9'; // J3 package
  
  const { data, error } = await supabase.rpc('exec_sql', { 
    query: `UPDATE client_packages SET available_quantity = 3000, consumed_quantity = 0 WHERE id = '${pkgId}'` 
  });
  
  if (error) {
    console.error("Error fixing J3:", error);
  } else {
    console.log("J3 balance reset to 3000 successfully.");
  }
}

fixJ3();
