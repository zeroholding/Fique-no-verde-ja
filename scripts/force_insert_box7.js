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

async function forceInsert() {
  const clientId = '1739b449-1f40-47c7-8e73-a69581b41bc6'; // From previous step
  const saleDate = new Date(2025, 6, 1, 12, 0, 0); // July 1st 2025
  const { v4: uuidv4 } = require('uuid');
  const saleId = uuidv4();

  const salePayload = {
      id: saleId,
      client_id: clientId,
      attendant_id: 'e6973302-3152-474c-9c7a-8f6424564c48', // Random valid user ID (Ana Santos likely)
      total: 555.00,
      total_discount: 0,
      subtotal: 555.00,
      payment_method: 'pix',
      sale_date: saleDate.toISOString(),
      created_at: new Date().toISOString(),
      status: 'confirmada',
      observations: 'Force insert test'
  };

  console.log("Inserting:", salePayload);

  const { data, error } = await supabase.from('sales').insert([salePayload]).select();
  
  if (error) {
      console.error("Insert Error:", error);
  } else {
      console.log("Insert Success:", data);
  }
}

forceInsert();
