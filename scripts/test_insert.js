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
  // Get a valid client
  const { data: c } = await supabase.from('clients').select('id').limit(1);
  if (!c || !c.length) { console.log('No clients'); return; }
  const clientId = c[0].id;

  const payload = {
      id: saleId,
      sale_number: 999999, // Test ID
      client_id: clientId,
      total: 100,
      total_discount: 0,
      attendant_id: null,
      payment_method: 'PIX',
      status: 'completed',
      created_at: new Date().toISOString()
  };
  
  console.log("Inserting:", payload);
  const { error } = await supabase.from('sales').insert([payload]);
  if (error) console.error("Error:", error);
  else console.log("Success!");
}
test();
