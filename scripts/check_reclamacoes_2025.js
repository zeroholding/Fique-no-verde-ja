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

// Normalize helper (simple JS version of SQL logic)
function normalize(str) {
    if (!str) return '';
    return str.toLowerCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
              .trim();
}

async function checkReclamacoes2025() {
  console.log("Checking Reclamações/Atrasos (01/01/2025 - 30/11/2025)...\n");

  const startDate = '2025-01-01T00:00:00.000Z';
  const endDate = '2025-11-30T23:59:59.999Z';

  // Fetch sales in range
  // We need to fetch items too.
  // Assuming volume is manageable for checking.
  
  // Strategy: Fetch items where sale_date is in range.
  // Since we can't join easily in JS client without specific setup, let's fetch sales first then items.
  
  console.log("Fetching sales...");
  const { data: sales, error } = await supabase
    .from('sales')
    .select('id, sale_date, status')
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
    .neq('status', 'cancelada');

  if (error) {
     console.error("Error fetching sales:", error.message);
     return;
  }

  const saleIds = sales.map(s => s.id);
  console.log(`Found ${sales.length} active sales in period.`);

  if (saleIds.length === 0) return;

  // Fetch items for these sales
  console.log("Fetching items...");
  
  // Fetch in chunks
  let allItems = [];
  const chunkSize = 1000;
  for (let i = 0; i < saleIds.length; i += chunkSize) {
      const chunk = saleIds.slice(i, i + chunkSize);
      const { data: items } = await supabase
        .from('sale_items')
        .select(`
            id, 
            product_name, 
            product_id, 
            quantity, 
            sale_id,
            sale_type
        `)
        .in('sale_id', chunk);
      
      if (items) allItems = allItems.concat(items);
  }

  console.log(`Found ${allItems.length} total items.`);

  // Check matching
  let reclamacoesCount = 0;
  let atrasosCount = 0;
  let otherCount = 0;

  const potentialMisses = [];

  allItems.forEach(item => {
      const name = normalize(item.product_name);
      
      if (name.startsWith('reclam')) {
          reclamacoesCount += item.quantity || 0;
      } else if (name.startsWith('atras')) {
          atrasosCount += item.quantity || 0;
      } else {
          otherCount++;
          // Check if it LOOKS like one but missed
          if (name.includes('reclam') || name.includes('atras') || name.includes('rec') || name.includes('atr')) {
             if (potentialMisses.length < 50) {
                 potentialMisses.push({ 
                     id: item.id, 
                     original: item.product_name, 
                     normalized: name 
                 });
             }
          }
      }
  });

  console.log("\n--- JS ANALYSIS ---");
  console.log(`Reclamações Units: ${reclamacoesCount}`);
  console.log(`Atrasos Units: ${atrasosCount}`);
  
  console.log("\n--- POTENTIAL MISSES (items containing substring but not starting with it) ---");
  potentialMisses.forEach(m => {
      console.log(`[${m.id}] "${m.original}" -> "${m.normalized}"`);
  });
}

checkReclamacoes2025();
