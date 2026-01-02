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

async function probe() {
  console.log("Fetching sale item...");
  const { data: items } = await supabase.from('sale_items').select('id, sale_id').limit(1);
  if (!items.length) { console.error("No items"); return; }
  
  const item = items[0];
  const { data: sales } = await supabase.from('sales').select('attendant_id').eq('id', item.sale_id).single();
  
  console.log("Item ID:", item.id);
  console.log("Attendant ID:", sales.attendant_id);

  // Probe 2: Try sale_item_id, user_id, value
  const payload = {
      sale_item_id: item.id,
      user_id: sales.attendant_id,
      value: 10.00, // Try 'value'
      status: 'pending',
      created_at: new Date().toISOString()
  };
  
  console.log("Pyload:", payload);
  const { data, error } = await supabase.from('commissions').insert([payload]).select();
  
  if (error) {
      console.error("Probe 2 Failed:", error);
      if (error.message.includes("'value' column")) {
         console.log("Trying 'commission_value'...");
         const p3 = { ...payload }; delete p3.value; p3.commission_value = 10.00;
         const { error: e3 } = await supabase.from('commissions').insert([p3]).select();
         console.log("Probe 3 Result:", e3 || "Success");
      }
  } else {
      console.log("Probe 2 Success!", data);
  }
}

probe();
