
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSchema() {
  console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  
  const { data: path } = await s.rpc('exec_sql', { query: `SHOW search_path` });
  console.log("Search Path:", path);

  const { data: schemas } = await s.rpc('exec_sql', { query: `SELECT schema_name FROM information_schema.schemata` });
  console.log("Available Schemas:", schemas.map(s => s.schema_name).join(', '));

  const { data: tables } = await s.rpc('exec_sql', { query: `SELECT column_name FROM information_schema.columns WHERE table_name = 'sales'` });
  console.log("client_packages tables found:", JSON.stringify(tables, null, 2));
}
checkSchema();
