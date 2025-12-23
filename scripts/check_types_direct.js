const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTypesDirectly() {
  const queries = [
    "SELECT pg_typeof(sale_date) as type FROM sales LIMIT 1",
    "SELECT pg_typeof(reference_date) as type FROM commissions LIMIT 1"
  ];

  for (const sql of queries) {
    const { data, error } = await supabase.rpc('exec_sql', { query: sql });
    if (error) {
      console.error(`Error with ${sql}:`, error);
    } else {
      console.log(`Result for ${sql}:`, data);
    }
  }
}

checkTypesDirectly();
