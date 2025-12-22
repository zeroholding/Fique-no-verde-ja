
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  const { data, error } = await supabase.rpc('exec_sql', { query: `
    SELECT cp.id, cp.available_quantity, cp.is_active, cp.created_at, s.name as service_name
    FROM client_packages cp
    JOIN clients c ON cp.client_id = c.id
    JOIN services s ON cp.service_id = s.id
    WHERE c.name ILIKE '%J3%'
    ORDER BY cp.created_at DESC
  ` });
  if (error) { console.error(error); return; }
  console.log(JSON.stringify(data, null, 2));
}
debug();
