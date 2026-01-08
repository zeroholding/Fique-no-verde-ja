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

async function investigateByAttendant() {
  console.log("Investigating sales by THALITA with Reclamação...\n");

  // Fetch users
  const { data: users } = await supabase.from('users').select('id, first_name, last_name');
  const userMap = {};
  users.forEach(u => userMap[u.id] = `${u.first_name} ${u.last_name}`.trim());

  const thalitaUser = users.find(u => (u.first_name || '').toUpperCase().includes('THALITA'));
  const gianluccaUser = users.find(u => (u.first_name || '').toUpperCase().includes('GIANLUC'));

  console.log("Users Found:");
  if (thalitaUser) console.log(`  THALITA: ${thalitaUser.id}`);
  if (gianluccaUser) console.log(`  GIANLUCCA: ${gianluccaUser.id}`);
  console.log("");

  // Fetch all sales with items containing "Reclam" in product_name (limit to avoid timeout)
  const { data: items, error } = await supabase
    .from('sale_items')
    .select(`
      id,
      sale_id,
      product_name,
      quantity,
      sale_type
    `)
    .ilike('product_name', '%reclam%')
    .limit(1000);

  if (error) {
    console.error("Error fetching items:", error.message);
    return;
  }

  console.log(`Found ${items.length} items with "Reclamação" in name.\n`);

  if (items.length === 0) {
      console.log("No Reclamação items found.");
      return;
  }

  // Fetch sales for these items
  const saleIds = [...new Set(items.map(i => i.sale_id))];
  const { data: sales, error: salesErr } = await supabase
    .from('sales')
    .select('id, sale_date, attendant_id, status')
    .in('id', saleIds);

  if (salesErr || !sales) {
    console.error("Error fetching sales:", salesErr?.message || 'No data');
    return;
  }

  const salesMap = {};
  sales.forEach(s => salesMap[s.id] = s);

  // Filter for THALITA specifically
  const thalitaId = thalitaUser?.id;
  const thalitaItems = items.filter(item => {
      const sale = salesMap[item.sale_id];
      return sale && sale.attendant_id === thalitaId;
  });

  console.log(`Items from THALITA with "Reclamação": ${thalitaItems.length}\n`);

  if (thalitaItems.length > 0) {
      console.log("Sample (first 20):\n");
      console.log("Sale ID (short) | Date | Product | Qty | Type");
      console.log("----------------|------|---------|-----|-----");
      thalitaItems.slice(0, 20).forEach(item => {
        const sale = salesMap[item.sale_id];
        console.log(`${sale.id.slice(0,8)}... | ${new Date(sale.sale_date).toLocaleDateString('pt-BR')} | ${item.product_name} | ${item.quantity} | ${item.sale_type}`);
      });
  }

  // Summary
  console.log("\n--- SUMMARY ---");
  console.log(`Total items "Reclamação" from THALITA: ${thalitaItems.length}`);
  console.log(`Unique sales: ${[...new Set(thalitaItems.map(i => i.sale_id))].length}`);

  // Can we change?
  console.log("\n--- WHAT NEEDS TO CHANGE ---");
  console.log("1. product_name 'Reclamação' → 'Atrasos'");
  console.log(`2. attendant_id ${thalitaId} → ${gianluccaUser?.id} (GIANLUCCA)`);
}

investigateByAttendant();
