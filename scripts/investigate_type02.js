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

async function investigateType02() {
  console.log("Investigating Type 02 Sales...\n");

  // 1. Fetch Type 02 sales with items and attendant info
  const { data: sales, error } = await supabase
    .from('sales')
    .select(`
      id,
      sale_date,
      attendant_id,
      status,
      observations,
      subtotal,
      total,
      sale_items (
        id,
        product_name,
        quantity,
        sale_type
      )
    `)
    .neq('status', 'cancelada')
    .order('sale_date', { ascending: false });

  if (error) {
    console.error("Error fetching sales:", error.message);
    return;
  }

  // 2. Fetch users to get attendant names
  const { data: users } = await supabase.from('users').select('id, first_name, last_name');
  const userMap = {};
  users.forEach(u => userMap[u.id] = `${u.first_name} ${u.last_name}`.trim());

  // 3. Filter for Type 02 sales
  const type02Sales = sales.filter(s => 
    s.sale_items && s.sale_items.some(i => i.sale_type === '02')
  );

  console.log(`Found ${type02Sales.length} Type 02 (Package Sale) sales.\n`);

  if (type02Sales.length === 0) {
    console.log("No Type 02 sales found.");
    return;
  }

  console.log("Details:\n");
  console.log("ID | Date | Attendant | Product | Qty");
  console.log("---|------|-----------|---------|----");

  type02Sales.forEach(sale => {
    const attendant = userMap[sale.attendant_id] || 'Unknown';
    sale.sale_items.filter(i => i.sale_type === '02').forEach(item => {
       console.log(`${sale.id.slice(0,8)}... | ${new Date(sale.sale_date).toLocaleDateString('pt-BR')} | ${attendant} | ${item.product_name} | ${item.quantity}`);
    });
  });

  // Summary
  console.log("\n--- SUMMARY ---");
  
  // Count by product name
  const productCounts = {};
  const attendantCounts = {};
  type02Sales.forEach(sale => {
    const attendant = userMap[sale.attendant_id] || 'Unknown';
    attendantCounts[attendant] = (attendantCounts[attendant] || 0) + 1;
    
    sale.sale_items.filter(i => i.sale_type === '02').forEach(item => {
        productCounts[item.product_name] = (productCounts[item.product_name] || 0) + 1;
    });
  });

  console.log("\nBy Product Name:");
  Object.entries(productCounts).forEach(([name, count]) => console.log(`  - ${name}: ${count}`));

  console.log("\nBy Attendant:");
  Object.entries(attendantCounts).forEach(([name, count]) => console.log(`  - ${name}: ${count}`));

  // Find GIANLUCCA ID
  const gianluccaUser = users.find(u => (u.first_name || '').toUpperCase().includes('GIANLUC'));
  if (gianluccaUser) {
      console.log(`\nGIANLUCCA User ID: ${gianluccaUser.id} (${gianluccaUser.first_name} ${gianluccaUser.last_name})`);
  } else {
      console.log("\nCouldn't find GIANLUCCA user.");
  }

  // Find THALITA ID
  const thalitaUser = users.find(u => (u.first_name || '').toUpperCase().includes('THALITA'));
  if (thalitaUser) {
      console.log(`THALITA User ID: ${thalitaUser.id} (${thalitaUser.first_name} ${thalitaUser.last_name})`);
  }
}

investigateType02();
