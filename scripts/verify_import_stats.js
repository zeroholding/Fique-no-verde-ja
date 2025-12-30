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
  const { count: salesCount } = await supabase.from('sales').select('*', { count: 'exact', head: true });
  const { count: itemsCount } = await supabase.from('sale_items').select('*', { count: 'exact', head: true });
  
  console.log('Total Sales in DB:', salesCount);
  console.log('Total Sale Items in DB:', itemsCount);

  // Check one recent sale
  const { data: recent } = await supabase.from('sales').select('*, sale_items(*)').limit(1).order('created_at', { ascending: false });
  console.log('Recent Sale Sample:', JSON.stringify(recent, null, 2));
}
check();
