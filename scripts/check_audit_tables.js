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

async function check() {
  const { data, error } = await supabase.rpc('exec_sql', { 
    query: "SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%log%' OR table_name LIKE '%audit%'" 
  });
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Audit/Log Tables found:");
    console.table(data);
  }
}
check();
