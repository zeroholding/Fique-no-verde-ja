const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRealTypes() {
  const sql = `
    SELECT 
      table_name, 
      column_name, 
      data_type, 
      udt_name
    FROM information_schema.columns 
    WHERE (table_name = 'commissions' AND column_name = 'reference_date')
       OR (table_name = 'sales' AND column_name = 'sale_date');
  `;

  const { data, error } = await supabase.rpc('exec_sql', { query: sql });

  if (error) {
    console.error('Error fetching types:', error);
  } else {
    console.log('Real Table Types:');
    console.table(data);
  }
}

checkRealTypes();
