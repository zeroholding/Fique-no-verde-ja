const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

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

async function test() {
  const saleId = uuidv4();
  const { data: c } = await supabase.from('clients').select('id').limit(1);
  if (!c || !c.length) return;
  const clientId = c[0].id;
  const now = new Date().toISOString();

  // Check Table Type
  const { data: t } = await supabase.rpc('exec_sql', { query: "SELECT table_type FROM information_schema.tables WHERE table_name = 'sales'" });
  console.log('Table Type:', t);

  // RAW SQL INSERT WITHOUT SALE_NUMBER
  const query = `
    INSERT INTO sales (id, client_id, total, total_discount, payment_method, status, created_at)
    VALUES ('${saleId}', '${clientId}', 100, 0, 'PIX', 'completed', '${now}')
  `;
  
  console.log("Executing SQL (No SaleNumber):", query);
  const { error } = await supabase.rpc('exec_sql', { query });
  
  if (error) console.error("Error:", error);
  else console.log("Success!");
}
test();
