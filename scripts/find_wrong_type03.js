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

async function findWrongType03() {
  console.log("Searching for Type 03 items labeled as 'Reclamação' (The ANOMALIES)...\n");

  // Fetch items where sale_type is '03' AND product_name ILIKE '%reclam%'
  const { data: items, error } = await supabase
    .from('sale_items')
    .select(`
        id, 
        product_name, 
        quantity, 
        sale_id,
        sales (
            id,
            sale_date,
            attendant_id,
            users (first_name, last_name)
        )
    `)
    .eq('sale_type', '03')
    .ilike('product_name', '%reclam%');

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  console.log(`Found ${items.length} suspicious items.\n`);

  if (items.length === 0) return;

  // Group by Attendant and Date Range
  const stats = {};
  
  items.forEach(item => {
      const sale = item.sales;
      if (!sale) return;
      
      const attendantName = sale.users ? `${sale.users.first_name || ''} ${sale.users.last_name || ''}`.trim() : 'Unknown';
      const date = new Date(sale.sale_date);
      const monthYear = `${date.getMonth()+1}/${date.getFullYear()}`;

      const key = `${attendantName} (${monthYear})`;
      
      if (!stats[key]) stats[key] = { count: 0, qty: 0 };
      stats[key].count++;
      stats[key].qty += (item.quantity || 0);
  });

  console.log("Breakdown of 'Reclamação' in Type 03:");
  console.log("Attendant (Month/Year) | Count | Total Qty");
  console.log("-----------------------|-------|----------");
  
  Object.entries(stats).forEach(([key, val]) => {
      console.log(`${key.padEnd(22)} | ${val.count} | ${val.qty}`);
  });

  console.log("\nSample Items:");
  items.slice(0, 5).forEach(i => {
      console.log(`  ${i.product_name} | Sale: ${i.sales?.sale_date?.slice(0,10)} | Attendant: ${i.sales?.users?.first_name}`);
  });
}

findWrongType03();
