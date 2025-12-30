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
  const { data: cols } = await supabase.rpc('exec_sql', { query: "SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'sale_number'" });
  console.log('Column Def:', cols);

  const { data: max } = await supabase.from('sales').select('sale_number').order('sale_number', { ascending: false }).limit(1);
  console.log('Max Sale Number:', max);
}
check();
