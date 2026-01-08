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

async function fixAllConsistency() {
  console.log("Checking Sales Consistency for ALL sales...");
  
  // Fetch ALL sales (might need pagination if too large, but lets try fetching all active ones first)
  // Limit to 2000 for safety, loop if needed? 
  // Given the context (recent project), fetch all should be fine or use a loop.
  // Let's use simple fetch first.
  
  const { data: sales, error } = await supabase
    .from('sales')
    .select(`
      id,
      total,
      subtotal,
      total_discount,
      general_discount_value,
      sale_date,
      sale_items (
        subtotal,
        total,
        discount_amount
      )
    `)
    .neq('status', 'cancelada')
    .order('sale_date', { ascending: false });

  if (error) {
    console.error("Error fetching sales:", error.message);
    return;
  }

  console.log(`Scanning ${sales.length} sales...`);

  let inconsistencies = 0;

  for (const sale of sales) {
      let sumSubtotal = 0;
      let sumDiscount = 0;
      let sumTotal = 0;

      if (sale.sale_items && sale.sale_items.length > 0) {
          sale.sale_items.forEach(item => {
              sumSubtotal += (item.subtotal || 0);
              sumDiscount += (item.discount_amount || 0);
              sumTotal += (item.total || 0);
          });
      } else {
          // No items? Should we trust the header? 
          // If header says 0 and items 0, it matches.
          // If header says >0 and items 0, it's an inconsistency (orphaned header). 
          // We will reset header to 0 if items are empty.
      }
      
      const expectedTotal = sumTotal - (sale.general_discount_value || 0);
      const expectedTotalDiscount = sumDiscount + (sale.general_discount_value || 0);
      
      const diffDiscount = Math.abs((sale.total_discount || 0) - expectedTotalDiscount);
      const diffTotal = Math.abs((sale.total || 0) - expectedTotal);
      
      if (diffDiscount > 0.05 || diffTotal > 0.05) {
          console.log(`Mismatch Sale ${sale.id} (${sale.sale_date}):`);
          console.log(`   Items Count: ${sale.sale_items.length}`);
          console.log(`   DB Discount: ${sale.total_discount} | Expected: ${expectedTotalDiscount}`);
          console.log(`   DB Total: ${sale.total} | Expected: ${expectedTotal}`);
          
          // Fix it
          const { error: updateError } = await supabase
            .from('sales')
            .update({
                total_discount: expectedTotalDiscount,
                total: expectedTotal,
                discount_amount: expectedTotalDiscount,
                subtotal: sumSubtotal
            })
            .eq('id', sale.id);
            
          if (updateError) console.error("Update failed:", updateError);
          else console.log("   -> FIXED.");
          
          inconsistencies++;
      }
  }

  console.log(`\nScan complete. Fixed ${inconsistencies} sales.`);
}

fixAllConsistency();
