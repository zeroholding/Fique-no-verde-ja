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

async function checkOneSale() {
  console.log("Checking structure of ONE 2025 sale...\n");

  const startDate = '2025-01-01T00:00:00.000Z';
  const endDate = '2025-11-30T23:59:59.999Z';

  // Fetch ONE sale
  const { data: sales, error } = await supabase
    .from('sales')
    .select('*')
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
    .limit(1);

  if (error || !sales || sales.length === 0) {
      console.log("No sales found or error:", error?.message);
      return;
  }

  const sale = sales[0];
  console.log("Sale found:", sale.id);
  console.log("Date:", sale.sale_date);
  console.log("Total:", sale.total);
  
  // Check items for this SPECIFIC sale
  const { data: items, error: itemErr } = await supabase
    .from('sale_items')
    .select('*')
    .eq('sale_id', sale.id);

  if (itemErr) {
      console.log("Error fetching items:", itemErr.message);
  } else {
      console.log(`Items count: ${items.length}`);
      if (items.length > 0) {
          console.log(items);
      } else {
          console.log("WARNING: No items found for this sale in sale_items table.");
      }
  }

  // Check if there are ANY columns in 'sales' table that might hold this info?
  // We already dumped the sale object.
  // Let's print keys.
  console.log("Sale keys:", Object.keys(sale));
}

checkOneSale();
