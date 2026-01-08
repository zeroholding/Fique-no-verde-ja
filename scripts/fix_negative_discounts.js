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

async function fixNegativeDiscounts() {
  console.log("=== Fixing Negative Discount Values ===\n");

  const startDate = '2025-01-01T00:00:00Z';
  const endDate = '2025-11-30T23:59:59Z';

  // Fetch all sales with negative total_discount
  const { data: sales, error } = await supabase
    .from('sales')
    .select('id, total_discount, discount_amount')
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
    .lt('total_discount', 0);

  if (error) {
    console.error("Error fetching sales:", error.message);
    return;
  }

  console.log(`Found ${sales.length} sales with negative total_discount.\n`);

  let updatedCount = 0;
  let errorCount = 0;

  for (const sale of sales) {
    // Invert the sign
    const newTotalDiscount = Math.abs(sale.total_discount);
    const newDiscountAmount = Math.abs(sale.discount_amount || 0);

    const { error: updateErr } = await supabase
      .from('sales')
      .update({ 
        total_discount: newTotalDiscount, 
        discount_amount: newDiscountAmount 
      })
      .eq('id', sale.id);

    if (updateErr) {
      console.error(`Error updating ${sale.id}: ${updateErr.message}`);
      errorCount++;
    } else {
      updatedCount++;
      if (updatedCount % 100 === 0) process.stdout.write('.');
    }
  }

  console.log(`\n\n✅ DONE! Updated ${updatedCount} sales.`);
  console.log(`❌ Errors: ${errorCount}`);
}

fixNegativeDiscounts();
