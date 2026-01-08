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

// Normalize helper
function normalize(str) {
    if (!str) return '';
    return str.toLowerCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
              .trim();
}

async function analyzeType03Categorization2025() {
  console.log("Analyzing Type 03 Item Categorization (2025 specific)...\n");

  const startDate = '2025-01-01T00:00:00.000Z';
  const endDate = '2025-11-30T23:59:59.999Z';

  // Fetch items for sales in 2025 that ARE Type 03
  // Joining invalidates easy filtering in simple client, so let's fetch sales then items.

  const { data: sales, error } = await supabase
    .from('sales')
    .select('id')
    .gte('sale_date', startDate)
    .lte('sale_date', endDate);
    
  if (error) { console.error(error); return; }
  
  const saleIds = sales.map(s => s.id);
  console.log(`Found ${saleIds.length} sales in 2025.`);
  
  if (saleIds.length === 0) return;

  // Now items
  let type03Items = [];
  const chunkSize = 1000;
  for (let i = 0; i < saleIds.length; i += chunkSize) {
      const chunk = saleIds.slice(i, i + chunkSize);
      const { data: items } = await supabase
        .from('sale_items')
        .select('*')
        .in('sale_id', chunk)
        .eq('sale_type', '03'); // Filter Type 03 here
      
      if (items) type03Items = type03Items.concat(items);
  }

  console.log(`Found ${type03Items.length} Type 03 items in 2025.`);

  if (type03Items.length === 0) {
      console.log("No Type 03 items found in 2025. This contradicts the user's premise if they see errors in 2025 data.");
      return;
  }

  const nameCounts = {};

  type03Items.forEach(item => {
      const originalName = item.product_name;
      const normalizeName = normalize(originalName);
      
      if (!nameCounts[originalName]) {
          nameCounts[originalName] = { count: 0, totalQty: 0, examples: [] };
      }
      nameCounts[originalName].count++;
      nameCounts[originalName].totalQty += (item.quantity || 0);
      
      const isReclam = normalizeName.includes('reclam');
      const isAtras = normalizeName.includes('atras');
      
      let type = 'NEITHER';
      if (isReclam && isAtras) type = 'BOTH';
      else if (isReclam) type = 'RECLAMACAO';
      else if (isAtras) type = 'ATRASO';
      
      nameCounts[originalName].type = type;
  });

  console.log("\n--- AGGREGATED PRODUCT NAMES (Type 03 - 2025) ---");
  console.log("Type | Product Name | Total Items | Total Qty | Logic Check");
  console.log("-----|--------------|-------------|-----------|------------");

  Object.entries(nameCounts).forEach(([pName, stats]) => {
     console.log(`${stats.type.padEnd(12)} | "${pName}" | ${stats.count} | ${stats.totalQty} | Norm: "${normalize(pName)}"`);
  });

}

analyzeType03Categorization2025();
