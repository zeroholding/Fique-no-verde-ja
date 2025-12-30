const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Manually load env vars
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const parseEnv = (key) => {
  const regex = new RegExp(`${key}=["']?([^"'\n]+)["']?`);
  const match = envContent.match(regex);
  return match ? match[1] : null;
};

const supabaseUrl = parseEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseServiceKey = parseEnv('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectAuditLogs() {
  console.log("Inspecting 'audit_log_entries' table columns...");
  
  // 1. Introspect columns and SCHEMA
  const introspectionQuery = `
      SELECT table_schema, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'audit_log_entries'
    `;
  const schemaRes = await supabase.rpc('exec_sql', { query: introspectionQuery });
  
  if (schemaRes.error) {
     console.error("Error introspecting audit table:", schemaRes.error);
     return;
  }
  
  console.table(schemaRes.data);
  if (schemaRes.data.length === 0) {
      console.log("Table found in list but no columns found? Check permissions.");
      return;
  }

  const schemaName = schemaRes.data[0].table_schema;
  const columns = schemaRes.data.map(c => c.column_name);
  
  console.log(`\nFetching recent audit entries from ${schemaName}.audit_log_entries...`);
  const recentQuery = `SELECT * FROM ${schemaName}.audit_log_entries ORDER BY ${columns.includes('created_at') ? 'created_at' : 'instance_id'} DESC LIMIT 10`;
  const recentRes = await supabase.rpc('exec_sql', { query: recentQuery });
  
  if (recentRes.data && recentRes.data.length > 0) {
      console.table(recentRes.data);
  } else {
      console.log("No recent entries found or failed to query.");
      if (recentRes.error) console.error(recentRes.error);
  }
}

inspectAuditLogs();
