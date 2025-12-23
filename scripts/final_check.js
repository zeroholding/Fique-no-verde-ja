const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data, error } = await supabase.rpc('exec_sql', { 
    query: "SELECT pg_typeof(reference_date)::text as type FROM commissions LIMIT 1" 
  });
  if (error) console.error(error);
  else console.log('Type of reference_date:', data);
}

check();
