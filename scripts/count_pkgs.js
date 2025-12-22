
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function countAll() {
  const { data: count, error } = await s.rpc('exec_sql', { query: `SELECT COUNT(*) FROM sales` });
  console.log("Total sales:", count);
}
countAll();
