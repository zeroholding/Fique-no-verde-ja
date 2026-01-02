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

async function findSale() {
  const saleId = '96e2ea2c-fbb2-4bfe-9856-783aa4ace873';
  console.log(`Searching for sale: ${saleId}`);

  const { data: sale, error } = await supabase
    .from('sales')
    .select(`
      *,
      clients (name, email),
      users (first_name, last_name, email),
      sale_items (*)
    `)
    .eq('id', saleId)
    .single();

  if (error) {
    console.error("Error finding sale:", error);
    return;
  }

  if (!sale) {
    console.log("Sale not found.");
    return;
  }

  console.log("\n--- SALE DETAILS ---");
  console.log(`ID: ${sale.id}`);
  console.log(`Date: ${sale.sale_date}`);
  console.log(`Created: ${sale.created_at}`);
  console.log(`Client: ${sale.clients?.name} (${sale.clients?.email})`);
  console.log(`Attendant: ${sale.users?.first_name} ${sale.users?.last_name} (${sale.users?.email})`);
  console.log(`Total: ${sale.total}`);
  console.log(`Status: ${sale.status}`);
  console.log(`Payment: ${sale.payment_method}`);
  console.log("--------------------");
  
  if (sale.sale_items && sale.sale_items.length > 0) {
      console.log("\n--- ITEMS ---");
      sale.sale_items.forEach((item, idx) => {
          console.log(`#${idx+1}: ${item.product_name} - Qty: ${item.quantity} - Total: ${item.total}`);
      });
  } else {
      console.log("\nNo items found.");
  }
}

findSale();
