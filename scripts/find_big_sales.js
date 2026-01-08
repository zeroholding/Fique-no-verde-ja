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

async function findBigSales() {
  console.log("Finding LARGE sales from THALITA...\n");

  // Fetch users
  const { data: users } = await supabase.from('users').select('id, first_name, last_name');
  const userMap = {};
  users.forEach(u => userMap[u.id] = `${u.first_name} ${u.last_name}`.trim());

  const thalitaUser = users.find(u => (u.first_name || '').toUpperCase().includes('THALITA'));
  const thalitaId = thalitaUser?.id;

  console.log(`THALITA ID: ${thalitaId}\n`);

  // Fetch ALL items from THALITA with large quantities
  const { data: items, error } = await supabase
    .from('sale_items')
    .select('id, sale_id, product_name, quantity, sale_type')
    .order('quantity', { ascending: false });

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  // Get unique sale IDs
  const saleIds = [...new Set(items.map(i => i.sale_id))];

  // Fetch sales in chunks
  let allSales = [];
  const chunkSize = 50;
  for (let i = 0; i < saleIds.length; i += chunkSize) {
      const chunk = saleIds.slice(i, i + chunkSize);
      const { data: salesChunk } = await supabase
        .from('sales')
        .select('id, sale_date, attendant_id, status')
        .in('id', chunk);
      if (salesChunk) allSales = allSales.concat(salesChunk);
  }

  const salesMap = {};
  allSales.forEach(s => salesMap[s.id] = s);

  // Filter for THALITA only and sort by quantity
  const thalitaItems = items.filter(item => {
      const sale = salesMap[item.sale_id];
      return sale && sale.attendant_id === thalitaId;
  }).sort((a, b) => b.quantity - a.quantity);

  console.log(`Total items from THALITA: ${thalitaItems.length}\n`);

  // Show TOP items by quantity
  console.log("TOP 20 LARGEST sales from THALITA (by quantity):\n");
  console.log("Sale ID (short) | Date | Product | Qty | Type");
  console.log("----------------|------|---------|-----|-----");
  
  thalitaItems.slice(0, 20).forEach(item => {
    const sale = salesMap[item.sale_id];
    if (sale) {
        console.log(`${sale.id.slice(0,8)}... | ${new Date(sale.sale_date).toLocaleDateString('pt-BR')} | ${item.product_name} | ${item.quantity} | ${item.sale_type}`);
    }
  });

  // Count items with qty >= 100
  const largeItems = thalitaItems.filter(i => i.quantity >= 100);
  console.log(`\nItems with quantity >= 100: ${largeItems.length}`);
  
  if (largeItems.length > 0) {
      console.log("\nThese are probably the ones to fix:");
      largeItems.forEach(item => {
        const sale = salesMap[item.sale_id];
        console.log(`  ${sale.id} | ${item.product_name} | ${item.quantity} units | Type ${item.sale_type}`);
      });
  }
}

findBigSales();
