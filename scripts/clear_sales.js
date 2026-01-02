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

async function clearSales() {
  console.log("Deleting ALL sales and items...");
  
  // Delete commissions first (FK)
  const { error: err0 } = await supabase.from('commissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err0) console.error("Error deleting commissions:", err0);
  else console.log("Commissions deleted.");

  // Delete dependent tables (FK)
  await supabase.from('package_consumptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  
  // client_packages references sales
  const { error: errCP } = await supabase.from('client_packages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (errCP) console.error("Error deleting client_packages:", errCP);
  else console.log("Client Packages deleted.");

  // sale_refunds references sales
  const { error: errSR } = await supabase.from('sale_refunds').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (errSR) console.error("Error deleting sale_refunds:", errSR);
  else console.log("Sale Refunds deleted.");
  
  // Delete items (FK)
  const { error: err1 } = await supabase.from('sale_items').delete().gt('created_at', '1970-01-01T00:00:00Z');
  if (err1) console.error("Error deleting items:", err1);
  else console.log("Items deleted.");

  // Delete sales
  const { error: err2 } = await supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err2) console.error("Error deleting sales:", err2);
  else console.log("Sales deleted.");
  
  // Reset sequence
   // Update Sequence
  console.log("Resetting Sequence...");
  const { error: seqError } = await supabase.rpc('exec_sql', { 
      query: "ALTER SEQUENCE sales_sale_number_seq RESTART WITH 1" 
  });
  if (seqError) console.error("Error resetting sequence:", seqError);
}

clearSales();
