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

const supabaseUrl = parseEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseServiceKey = parseEnv('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
  const query = "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'sale_items' AND (column_name LIKE '%service%' OR column_name LIKE '%product%')";
  const { data, error } = await supabase.rpc('exec_sql', { query });
  if (error) console.error(error);
  else console.log(data);
}
check();
