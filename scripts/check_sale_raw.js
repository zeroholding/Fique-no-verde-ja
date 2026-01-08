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

const supabase = createClient(
  parseEnv('NEXT_PUBLIC_SUPABASE_URL'),
  parseEnv('SUPABASE_SERVICE_ROLE_KEY')
);

async function checkRaw() {
  const saleId = '8bacc0ac-7fcd-4dd8-b297-87f450268d92';
  console.log(`Checking RAW columns for: ${saleId}`);
  
  const { data, error } = await supabase
    .from('sales')
    .select('subtotal, total_discount, discount_amount, total, general_discount_value, general_discount_type')
    .eq('id', saleId)
    .single();

  if (error) {
    console.error(error);
  } else {
    console.log(data);
  }
}

checkRaw();
