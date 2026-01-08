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

async function investigateDiscountSign() {
  console.log("=== Investigating Discount Sign Issue ===\n");

  // Check 2025 sales vs 2026 sales discounts
  const ranges = [
    { name: '2025 (01/01 - 30/11)', start: '2025-01-01T00:00:00Z', end: '2025-11-30T23:59:59Z' },
    { name: '2026 (06/01 only)', start: '2026-01-06T00:00:00Z', end: '2026-01-06T23:59:59Z' },
  ];

  for (const range of ranges) {
    console.log(`\n--- ${range.name} ---`);

    // Fetch sales aggregates
    const { data: sales, error } = await supabase
      .from('sales')
      .select('id, total_discount, discount_amount, total, subtotal')
      .gte('sale_date', range.start)
      .lte('sale_date', range.end)
      .neq('status', 'cancelada');

    if (error) {
      console.log("Error:", error.message);
      continue;
    }

    console.log(`Sales count: ${sales.length}`);

    // Analyze discount values
    let positiveCount = 0;
    let negativeCount = 0;
    let zeroCount = 0;
    let totalDiscountSum = 0;
    let discountAmountSum = 0;

    const negativeExamples = [];

    sales.forEach(s => {
      const td = parseFloat(s.total_discount || 0);
      const da = parseFloat(s.discount_amount || 0);
      totalDiscountSum += td;
      discountAmountSum += da;

      if (td > 0) positiveCount++;
      else if (td < 0) {
        negativeCount++;
        if (negativeExamples.length < 5) {
          negativeExamples.push({ id: s.id, total_discount: td, discount_amount: da, subtotal: s.subtotal, total: s.total });
        }
      }
      else zeroCount++;
    });

    console.log(`total_discount: Positive=${positiveCount}, Negative=${negativeCount}, Zero=${zeroCount}`);
    console.log(`SUM(total_discount): ${totalDiscountSum.toFixed(2)}`);
    console.log(`SUM(discount_amount): ${discountAmountSum.toFixed(2)}`);

    if (negativeExamples.length > 0) {
      console.log("\nExamples of NEGATIVE total_discount:");
      negativeExamples.forEach(ex => {
        console.log(`  ${ex.id.slice(0,8)}... | total_discount: ${ex.total_discount} | discount_amount: ${ex.discount_amount} | subtotal: ${ex.subtotal} | total: ${ex.total}`);
      });
    }
  }

  // Also check sale_items for negative discount_amount
  console.log("\n\n=== Checking sale_items for negative discount_amount ===");
  
  const { data: items2025, error: err2 } = await supabase
    .from('sale_items')
    .select('id, sale_id, discount_amount, subtotal, total')
    .lt('discount_amount', 0)
    .limit(10);

  if (err2) {
    console.log("Error:", err2.message);
  } else {
    console.log(`Found ${items2025.length} items with negative discount_amount (showing up to 10)`);
    items2025.forEach(i => {
      console.log(`  ${i.id.slice(0,8)}... | discount: ${i.discount_amount} | subtotal: ${i.subtotal} | total: ${i.total}`);
    });
  }
}

investigateDiscountSign();
