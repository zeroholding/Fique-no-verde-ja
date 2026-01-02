const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkColumnType() {
  const sql = `
    SELECT 
      table_name, 
      column_name, 
      data_type, 
      udt_name
    FROM information_schema.columns 
    WHERE table_name = 'commissions';
  `;

  const { data, error } = await supabase.rpc('exec_sql', { query: sql });

  if (error) {
    console.error('Error fetching column type:', error);
    // Fallback: Tentar pegar um registro e ver a cara da data
    const { data: sample } = await supabase.from('commissions').select('reference_date').limit(1);
    console.log('Sample reference_date:', sample?.[0]?.reference_date);
  } else {
    console.log('Column Types:');
    console.table(data);
  }
}

checkColumnType();
