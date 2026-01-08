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

async function analyzeSales() {
  console.log("Analyzing sales from 06/01/2026 for high discounts...\n");

  const startUTC = '2026-01-06T03:00:00.000Z'; // 00:00 BRT
  const endUTC = '2026-01-07T03:00:00.000Z';   // 00:00 BRT next day

  // Fetch sales with their items
  const { data: sales, error } = await supabase
    .from('sales')
    .select(`
      id,
      total,
      subtotal,
      total_discount,
      sale_date,
      attendant_id,
      sale_items (
        subtotal,
        total,
        discount_amount,
        product_name,
        quantity,
        sale_type
      )
    `)
    .neq('status', 'cancelada')
    .gte('sale_date', startUTC)
    .lt('sale_date', endUTC)
    .order('total_discount', { ascending: false });

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  // Fetch attendants
  const { data: users } = await supabase.from('users').select('id, first_name, last_name');
  const userMap = {};
  users.forEach(u => userMap[u.id] = `${u.first_name} ${u.last_name}`);

  console.log(`Found ${sales.length} sales on 06/01/2026.\n`);

  // Filter for Type 01 sales with discounts
  const salesWithDiscount = sales.filter(s => {
      const hasType01 = s.sale_items.some(i => i.sale_type === '01');
      return hasType01 && (s.total_discount > 0 || s.sale_items.some(i => i.discount_amount > 0));
  });

  console.log(`Sales Type 01 with Discounts: ${salesWithDiscount.length}\n`);

  // Check for anomalies
  let anomalies = 0;

  for (const sale of salesWithDiscount) {
      const attendantName = userMap[sale.attendant_id] || 'Unknown';

      // Sum item-level discounts
      const sumItemDiscounts = sale.sale_items.reduce((acc, i) => acc + (i.discount_amount || 0), 0);
      const sumSubtotal = sale.sale_items.reduce((acc, i) => acc + (i.subtotal || 0), 0);
      const sumTotal = sale.sale_items.reduce((acc, i) => acc + (i.total || 0), 0);

      // Check for mismatch
      const diff = Math.abs(sale.total_discount - sumItemDiscounts);

      if (sale.total_discount > 100 || diff > 0.05) {
          anomalies++;
          console.log("-------------------------------------------");
          console.log(`Sale ID: ${sale.id}`);
          console.log(`Attendant: ${attendantName}`);
          console.log(`Sale Date: ${sale.sale_date}`);
          console.log(`Header -> Subtotal: ${sale.subtotal}, Total: ${sale.total}, Discount: ${sale.total_discount}`);
          console.log(`Items   -> Sum Subtotal: ${sumSubtotal}, Sum Total: ${sumTotal}, Sum Discounts: ${sumItemDiscounts}`);
          console.log(`Diff: ${diff.toFixed(2)}`);
          console.log("Items:");
          sale.sale_items.forEach(i => {
              console.log(`   - ${i.product_name} x${i.quantity} | Sub: ${i.subtotal} | Tot: ${i.total} | Disc: ${i.discount_amount} | Type: ${i.sale_type}`);
          });
      }
  }

  console.log("\n===========================================");
  console.log(`Total Anomalies Found: ${anomalies}`);
  if (anomalies === 0) {
      console.log("✅ No sales with discount > R$ 100 or mismatched totals found!");
  }
}

analyzeSales();
