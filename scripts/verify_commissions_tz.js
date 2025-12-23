const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  const { data, error } = await supabase
    .from('sales')
    .select('id, sale_number, sale_date, created_at, commissions(id, reference_date, created_at)')
    .eq('sale_number', 145);

  if (error) {
    console.error('Error fetching data:', error);
  } else {
    console.log('Record for Sale #141:');
    console.log(JSON.stringify(data, null, 2));
  }
}

checkSchema();
