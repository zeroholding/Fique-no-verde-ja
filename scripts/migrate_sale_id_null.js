
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function migrate() {
  console.log("Altering client_packages table...");
  const { data, error } = await s.rpc('exec_sql', { 
    query: `ALTER TABLE client_packages ALTER COLUMN sale_id DROP NOT NULL` 
  });
  if (error) {
    console.error("Migration failed:", error);
  } else {
    console.log("Migration successful: sale_id is now nullable.");
  }
}
migrate();
