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

async function findRemocaoType03() {
  console.log("Searching for Type 03 items named 'Remoção'...\n");

  // Filter directly in items for product_name ILIKE '%Remo%' AND sale_type = '03'
  const { data: items, error } = await supabase
    .from('sale_items')
    .select('id, product_name, quantity, sale_type, sale_id')
    .ilike('product_name', '%remo%')
    .eq('sale_type', '03')
    .limit(50); // Just to verify existence

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  if (items.length === 0) {
      console.log("No items found matching the user's description (Type 03 + 'Remoção').");
      console.log("Checking if they exist as ANY type...");
      const { data: anyItems } = await supabase
        .from('sale_items')
        .select('id, product_name, sale_type')
        .ilike('product_name', '%remo%')
        .limit(5);
      
      console.log("Examples of 'Remoção' found (any type):");
      anyItems.forEach(i => console.log(`  ${i.product_name} (Type: ${i.sale_type})`));
      return;
  }

  console.log(`Found ${items.length} Type 03 items with 'Remoção' in the name.`);
  items.forEach(i => {
      console.log(`  ${i.product_name} | Type ${i.sale_type} | Qty ${i.quantity}`);
  });
}

findRemocaoType03();
