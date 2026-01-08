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

// Helper to determine if a date is a weekend (Sat=6, Sun=0)
// Note: This does not account for holidays unless we hardcode them, but let's check weekends first.
function isWeekend(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDay(); // 0 is Sunday, 6 is Saturday
    return day === 0 || day === 6;
}

async function analyzeCommissions() {
  console.log("Analyzing Commissions (01/01/2025 - 30/11/2025)...\n");

  const startDate = '2025-01-01T00:00:00.000Z';
  const endDate = '2025-11-30T23:59:59.999Z';

  // 1. Fetch Sales Type 01 in the period
  const { data: sales, error } = await supabase
    .from('sales')
    .select(`
      id,
      sale_date,
      total,
      commission_amount,
      status,
      sale_items (
        id,
        sale_type
      )
    `)
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
    .neq('status', 'cancelada');

  if (error) {
    console.error("Error fetching sales:", error.message);
    return;
  }

  // Filter for ONLY Type 01 sales (at least one item is type 01, generally if it's type 01 all items are 01 or null)
  // Or check if the sale itself effectively is type 01.
  // The user said "todas vendas tipo 01".
  const type01Sales = sales.filter(s => {
      // Assuming if any item is 01, it's a type 01 sale.
      // Often sales have mixed items but usually type is consistent.
      // Let's check if it has Type 01 items.
      return s.sale_items && s.sale_items.some(i => i.sale_type === '01');
  });

  console.log(`Found ${type01Sales.length} Type 01 sales in period.\n`);

  let correct = 0;
  let incorrect = 0;
  let missingCommission = 0;
  
  let weekdayCount = 0;
  let weekendCount = 0;

  console.log("Checking samples...");

  for (const sale of type01Sales) {
      if (!sale.total || sale.total <= 0) continue;

      const isWknd = isWeekend(sale.sale_date);
      if (isWknd) weekendCount++; else weekdayCount++;

      const expectedRate = isWknd ? 0.10 : 0.025; // 10% or 2.5%
      const expectedCommission = sale.total * expectedRate;
      
      const actualCommission = sale.commission_amount || 0;
      
      // Tolerance for floating point
      const diff = Math.abs(expectedCommission - actualCommission);
      const isMatch = diff < 0.10; // 10 cents tolerance

      if (!isMatch) {
          incorrect++;
          if (incorrect <= 10) {
              console.log(`[MISMATCH] Sale ${sale.id.slice(0,8)} | Date: ${new Date(sale.sale_date).toLocaleDateString('pt-BR')} (${isWknd ? 'Weekend' : 'Weekday'})`);
              console.log(`  Total: ${sale.total} | Expected Comm: ${expectedCommission.toFixed(2)} (${expectedRate*100}%) | Actual: ${actualCommission}`);
          }
      } else {
          correct++;
      }
      
      if (actualCommission === 0) missingCommission++;
  }

  console.log("\n--- SUMMARY ---");
  console.log(`Total Sales Checked: ${type01Sales.length}`);
  console.log(`Weekdays: ${weekdayCount}`);
  console.log(`Weekends: ${weekendCount}`);
  console.log(`Correct Commissions: ${correct}`);
  console.log(`Incorrect Commissions: ${incorrect}`);
  console.log(`Zero Commission (Missing): ${missingCommission}`);
  
  if (incorrect > 0) {
      console.log(`\nCONCLUSION: Commissions are NOT inconsistent with the 2.5% / 10% rule for ${incorrect} sales.`);
  } else {
      console.log(`\nCONCLUSION: All Commissions match the 2.5% / 10% rule!`);
  }
}

analyzeCommissions();
