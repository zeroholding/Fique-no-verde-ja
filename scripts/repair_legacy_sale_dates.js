
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function repair() {
  console.log("Repairing legacy midnight-offset sales...");
  
  // Find sales that are exactly at 00:00:00
  // Note: Since they are now TIMESTAMPTZ, we can check for HH:MM:SS = 0 in UTC
  const query = `
    UPDATE sales 
    SET sale_date = sale_date + interval '12 hours' 
    WHERE EXTRACT(HOUR FROM sale_date AT TIME ZONE 'UTC') = 0 
      AND EXTRACT(MINUTE FROM sale_date AT TIME ZONE 'UTC') = 0 
      AND EXTRACT(SECOND FROM sale_date AT TIME ZONE 'UTC') = 0
  `;
  
  const { data, error } = await s.rpc('exec_sql', { query });
  if (error) {
    console.error(error);
  } else {
    console.log("Legacy sales repaired (moved from 00:00 to 12:00 to safely show the correct day).");
  }
}

repair();
