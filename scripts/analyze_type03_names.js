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

// Normalize helper (mimics SQL logic)
function normalize(str) {
    if (!str) return '';
    return str.toLowerCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
              .trim();
}

async function analyzeType03Categorization() {
  console.log("Analyzing Type 03 Item Categorization...\n");

  // Fetch all Type 03 items (using DISTINCT product_name to reduce noise)
  // We can't do DISTINCT easily with select, so fetch all and process in JS.
  // Limiting to a reasonable number or checking specific date range if needed.
  // Let's verify ALL 2025/2026 data since user didn't specify date range, but likely recent or 2025 import.
  
  // We'll fetch just product_name and quantity for aggregation
  const { data: items, error } = await supabase
    .from('sale_items')
    .select('product_name, quantity, id, sale_id')
    .eq('sale_type', '03');

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  console.log(`Found ${items.length} Type 03 items total.`);

  const classification = {
      reclamacoes: [],
      atrasos: [],
      both: [], // Logic might overlap if we are not careful (SQL usually counts in separate subqueries)
      neither: []
  };

  const nameCounts = {};

  items.forEach(item => {
      const originalName = item.product_name;
      const name = normalize(originalName);
      
      if (!nameCounts[originalName]) {
          nameCounts[originalName] = { count: 0, totalQty: 0, examples: [] };
      }
      nameCounts[originalName].count++;
      nameCounts[originalName].totalQty += (item.quantity || 0);
      if (nameCounts[originalName].examples.length < 3) nameCounts[originalName].examples.push(item.id);

      const isReclam = name.includes('reclam');
      const isAtras = name.includes('atras');

      if (isReclam && isAtras) {
          // In SQL dashboard logic:
          // It runs two separate subqueries.
          // Query 1: LIKE '%reclam%' -> Counts as Reclamacao
          // Query 2: LIKE '%atras%' -> Counts as Atraso
          // So it would be counted in BOTH?
          // Let's check the SQL logic later, but for now let's flag "both".
      }

      if (isReclam) nameCounts[originalName].type = 'RECLAMACAO';
      else if (isAtras) nameCounts[originalName].type = 'ATRASO';
      else nameCounts[originalName].type = 'NEITHER';
      
      if (isReclam && isAtras) nameCounts[originalName].type = 'BOTH (Double Counted?)';
  });

  console.log("\n--- AGGREGATED PRODUCT NAMES (Type 03) ---");
  console.log("Type | Product Name | Total Items | Total Qty | categorization Logic");
  console.log("-----|--------------|-------------|-----------|--------------------");

  Object.entries(nameCounts).sort((a,b) => b[1].totalQty - a[1].totalQty).forEach(([pName, stats]) => {
      console.log(`${stats.type.padEnd(12)} | "${pName}" | ${stats.count} | ${stats.totalQty} | Norm: "${normalize(pName)}"`);
  });
}

analyzeType03Categorization();
