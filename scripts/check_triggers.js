const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const parseEnv = (key) => {
  const regex = new RegExp(`${key}=["']?([^"'\n]+)["']?`);
  const match = envContent.match(regex);
  return match ? match[1] : null;
};

const supabase = createClient(
  parseEnv('NEXT_PUBLIC_SUPABASE_URL'),
  parseEnv('SUPABASE_SERVICE_ROLE_KEY')
);

async function checkTriggers() {
  console.log("Checking triggers on 'sales' table...");
  
  const { data, error } = await supabase
    .rpc('get_triggers', { table_name: 'sales' }); // Fallback if rpc not exists, try sql

  // RPC might not exist, so let's use a raw query on information_schema
  // Supabase-js "rpc" calls a postgres function. We prob don't have one.
  // Use .from() ? No, sys tables need raw query usually or permissive select.
  // But we have "query" helper in local codebase. I will just write a query script using existing valid connection pattern.
}

// Rewriting to use Query pattern from previous scripts
// But wait, the standard supabase client doesn't support raw query directly unless enabled.
// I'll try to select from information_schema via standard select if permissions allow.
// Otherwise I might need to Create a RPC or use a PG client if available (not available).
// ACTUALLY, I can use the same pattern as `inspect_schema.js` if it worked?
// `inspect_schema.js` used .from('information_schema.columns').

async function listTriggers() {
    const { data, error } = await supabase
        .from('information_schema.triggers')
        .select('*')
        .eq('event_object_table', 'sales');
        
    if (error) {
        console.log("Error fetching triggers via supabase-js (might be restricted):", error.message);
    } else {
        console.log("Triggers found:", data);
    }
}

listTriggers();
