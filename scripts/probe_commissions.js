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
  console.log("Fetching sale and user...");
  const { data: sales, error: errS } = await supabase.from('sales').select('id, attendant_id, sale_date').limit(1);
  if (errS || !sales.length) { console.error("No sale found", errS); return; }
  
  const sale = sales[0];
  console.log("Sale ID:", sale.id);
  console.log("Attendant ID:", sale.attendant_id);

  // Probe 1: Try sale_id, user_id, amount
  console.log("Probing columns: sale_id, user_id, amount, status, reference_date...");
  const payload = {
      sale_id: sale.id, // FK to sales?
      user_id: sale.attendant_id,
      amount: 10.00,
      status: 'pending',
      reference_date: new Date().toISOString()
  };
  
  const { data, error } = await supabase.from('commissions').insert([payload]).select();
  
  if (error) {
      console.error("Probe 1 Failed:", error);
      // Analyze error
      // If "column "sale_id" of relation "commissions" does not exist" -> switch to sale_item_id?
  } else {
      console.log("Probe 1 Success!", data);
      // Clean up
      await supabase.from('commissions').delete().eq('id', data[0].id);
  }
}

probe();
