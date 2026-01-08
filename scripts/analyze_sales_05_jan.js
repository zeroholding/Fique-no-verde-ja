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

async function analyzeSalesJan05() {
  console.log("Analyzing Sales and Discounts for 2026-01-05 (America/Sao_Paulo)...");
  
  // 2026-01-05 00:00:00 BRT = 2026-01-05 03:00:00 UTC
  // 2026-01-06 00:00:00 BRT = 2026-01-06 03:00:00 UTC
  const startUTC = '2026-01-05T03:00:00.000Z';
  const endUTC = '2026-01-06T03:00:00.000Z';
  
  const { data: sales, error } = await supabase
    .from('sales')
    .select(`
      id,
      sale_date,
      total,
      subtotal,
      total_discount,
      status,
      sale_items (
        id,
        product_name,
        quantity,
        unit_price,
        subtotal,
        total,
        discount_value,
        sale_type
      )
    `)
    .neq('status', 'cancelada')
    .gte('sale_date', startUTC)
    .lt('sale_date', endUTC);

  if (error) {
    console.error("Error fetching sales:", error.message);
    return;
  }

  let totalRevenue = 0;
  let totalDiscounts = 0;
  let count = 0;
  let salesWithDiscount = [];

  sales.forEach(sale => {
    count++;
    
    // Calculate Revenue (same rule: Type 03 uses subtotal, others total)
    let saleRevenue = 0;
    
    // If we have items verify strictly, otherwise rely on sale total? 
    // The previous script used item-level logic for revenue.
    // But for discounts, we usually look at the sale level total_discount.
    
    if (sale.sale_items && sale.sale_items.length > 0) {
        sale.sale_items.forEach(item => {
             const val = item.sale_type === '03' ? item.subtotal : item.total;
             saleRevenue += val;
        });
    } else {
        // Fallback if no items (shouldn't happen usually)
        saleRevenue = sale.total;
    }
    
    totalRevenue += saleRevenue;
    totalDiscounts += (sale.total_discount || 0);

    if ((sale.total_discount || 0) > 0) {
        salesWithDiscount.push({
            id: sale.id,
            date: sale.sale_date,
            discount: sale.total_discount,
            items: sale.sale_items.map(i => `${i.product_name} (${i.quantity}x)`).join(', ')
        });
    }
  });

  console.log(`--- Results for 05/01/2026 ---`);
  console.log(`Sales Count: ${count}`);
  console.log(`Total Revenue: ${totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  console.log(`Total Discounts: ${totalDiscounts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  
  console.log(`\n--- Discounts Details ---`);
  if (salesWithDiscount.length > 0) {
      salesWithDiscount.forEach(s => {
          console.log(`Sale [${s.id.slice(0,8)}...]: -R$ ${s.discount.toFixed(2)} | Items: ${s.items}`);
      });
  } else {
      console.log("No sales with discounts found.");
  }
}

analyzeSalesJan05();
