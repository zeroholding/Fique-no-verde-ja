
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTarget() {
  const { data, error } = await s.rpc('exec_sql', { 
    query: `SELECT id, initial_quantity, available_quantity, updated_at FROM client_packages WHERE id IN ('415cb64c-6f0a-478d-933a-a2c5628dd1de', '272e7874-c81f-4f40-809c-9b5bfe0b40b9')` 
  });
  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}
checkTarget();
