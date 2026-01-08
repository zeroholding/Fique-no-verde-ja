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

async function investigateType03() {
  console.log("Investigating Type 03 (Package Consumption) Sales...\n");

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

  // Fetch Type 03 items
  const { data: items, error } = await supabase
    .from('sale_items')
    .select('id, sale_id, product_name, quantity, sale_type')
    .eq('sale_type', '03');

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  console.log(`Found ${items.length} Type 03 (Consumption) items.\n`);

  if (items.length === 0) {
    console.log("No Type 03 items found.");
    return;
  }

  // Get unique sale IDs and fetch sales in chunks
  const saleIds = [...new Set(items.map(i => i.sale_id))];
  console.log(`Unique sales: ${saleIds.length}`);

  // Fetch sales in smaller chunks
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

  // Filter for THALITA
  const thalitaId = thalitaUser?.id;
  const thalitaItems = items.filter(item => {
      const sale = salesMap[item.sale_id];
      return sale && sale.attendant_id === thalitaId;
  });

  console.log(`\nType 03 items from THALITA: ${thalitaItems.length}`);

  // Check how many have "Reclamação" as product_name
  const reclamacaoItems = thalitaItems.filter(i => 
      i.product_name.toLowerCase().includes('reclam')
  );
  console.log(`Items with "Reclamação" in name: ${reclamacaoItems.length}`);
  
  const atrasosItems = thalitaItems.filter(i => 
      i.product_name.toLowerCase().includes('atras')
  );
  console.log(`Items with "Atrasos" in name: ${atrasosItems.length}`);

  // Sample list
  if (thalitaItems.length > 0) {
      console.log("\nSample (first 15):");
      console.log("Sale ID (short) | Date | Product | Qty");
      console.log("----------------|------|---------|----");
      thalitaItems.slice(0, 15).forEach(item => {
        const sale = salesMap[item.sale_id];
        if (sale) {
            console.log(`${sale.id.slice(0,8)}... | ${new Date(sale.sale_date).toLocaleDateString('pt-BR')} | ${item.product_name} | ${item.quantity}`);
        }
      });
  }

  console.log("\n--- MUDANÇAS NECESSÁRIAS ---");
  console.log(`1. ${reclamacaoItems.length} itens: product_name 'Reclamação' → 'Atrasos'`);
  console.log(`2. ${thalitaItems.length} vendas: attendant_id THALITA → GIANLUCCA`);
  console.log(`\nIDs dos usuários:`);
  console.log(`  THALITA: ${thalitaId}`);
  console.log(`  GIANLUCCA: ${gianluccaUser?.id}`);
}

investigateType03();
