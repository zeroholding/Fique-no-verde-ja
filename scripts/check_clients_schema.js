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

async function checkSchema() {
  const query = `
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_name = 'clients'
  `;
  const { data, error } = await supabase.rpc('exec_sql', { query });
  
  if (error) {
    console.error("Error:", error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
checkSchema();
