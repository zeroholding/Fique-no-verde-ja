const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTriggers() {
  const sql = `
    SELECT 
      event_object_table as table_name, 
      trigger_name, 
      action_statement 
    FROM information_schema.triggers 
    WHERE event_object_table IN ('sales', 'commissions');
  `;

  const { data, error } = await supabase.rpc('exec_sql', { query: sql });

  if (error) {
    console.error('Error fetching triggers:', error);
  } else {
    console.log('Triggers:');
    console.table(data);
  }
}

checkTriggers();
