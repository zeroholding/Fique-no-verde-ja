
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function migrate() {
  console.log("Migrating timestamp columns to TIMESTAMPTZ...");
  
  const queries = [
    "ALTER TABLE sales ALTER COLUMN sale_date TYPE TIMESTAMPTZ USING sale_date AT TIME ZONE 'UTC'",
    "ALTER TABLE sales ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'",
    "ALTER TABLE sales ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC'",
    "ALTER TABLE sale_items ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'",
    "ALTER TABLE sale_items ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC'"
  ];

  for (const query of queries) {
    console.log(`Running: ${query}`);
    const { error } = await s.rpc('exec_sql', { query });
    if (error) {
       console.error(`Error in ${query}:`, error);
    }
  }
  
  console.log("Migration finished.");
}

migrate();
