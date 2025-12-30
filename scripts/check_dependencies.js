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
  console.log("Checking dependencies...");
  
  // 1. Sale Items Schema
  const { data: sCols } = await supabase.rpc('exec_sql', { query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'sale_items'" });
  console.log('Sale Items Columns:', sCols ? sCols.map(c=>c.column_name) : 'Error');

  // 2. Services
  const { data: svcs } = await supabase.from('services').select('id, name, price');
  console.log('\n--- Services ---');
  if (svcs) svcs.forEach(s => console.log(`"${s.name}" (ID: ${s.id})`));

  // 3. Search for Bruna
  const { data: bruna } = await supabase.from('users').select('id, first_name, last_name, email').ilike('first_name', '%Bruna%');
  console.log('\n--- Users like Bruna ---');
  console.log(JSON.stringify(bruna, null, 2));
}

check();
