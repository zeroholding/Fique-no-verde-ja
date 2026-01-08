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

async function fixConsistency() {
  console.log("Checking Sales Consistency for 2026-01-06...");
  
  const startUTC = '2026-01-06T03:00:00.000Z';
  const endUTC = '2026-01-07T03:00:00.000Z';
  
  // Fetch sales and their items
  const { data: sales, error } = await supabase
    .from('sales')
    .select(`
      id,
      total,
      subtotal,
      total_discount,
      general_discount_value,
      sale_items (
        subtotal,
        total,
        discount_amount
      )
    `)
    .neq('status', 'cancelada')
    .gte('sale_date', startUTC)
    .lt('sale_date', endUTC);

  if (error) {
    console.error("Error fetching sales:", error.message);
    return;
  }

  let inconsistencies = 0;

  for (const sale of sales) {
      let sumSubtotal = 0;
      let sumDiscount = 0;
      let sumTotal = 0;

      sale.sale_items.forEach(item => {
          sumSubtotal += item.subtotal;
          sumDiscount += item.discount_amount;
          sumTotal += item.total;
      });
      
      // Add General Discount to sale level sums?
      // Sale Total = Sum(Item Total) - General Discount
      const expectedTotal = sumTotal - (sale.general_discount_value || 0);
      const expectedTotalDiscount = sumDiscount + (sale.general_discount_value || 0);
      
      const diffDiscount = Math.abs(sale.total_discount - expectedTotalDiscount);
      const diffTotal = Math.abs(sale.total - expectedTotal);
      
      if (diffDiscount > 0.05 || diffTotal > 0.05) {
          console.log(`Mismatch Sale ${sale.id}:`);
          console.log(`   DB Discount: ${sale.total_discount} | Expected: ${expectedTotalDiscount}`);
          console.log(`   DB Total: ${sale.total} | Expected: ${expectedTotal}`);
          
          // Fix it
          const { error: updateError } = await supabase
            .from('sales')
            .update({
                total_discount: expectedTotalDiscount,
                total: expectedTotal,
                discount_amount: expectedTotalDiscount // assuming this column mirrors total_discount logic in route.ts
            })
            .eq('id', sale.id);
            
          if (updateError) console.error("Update failed:", updateError);
          else console.log("   -> FIXED.");
          
          inconsistencies++;
      }
  }

  console.log(`\nScan complete. Fixed ${inconsistencies} sales.`);
}

fixConsistency();
