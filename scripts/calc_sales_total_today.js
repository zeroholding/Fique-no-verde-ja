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

async function calcSalesTotalToday() {
  console.log("Calculating total revenue for 2026-01-06 (America/Sao_Paulo)...");
  
  // 2026-01-06 00:00:00 BRT = 2026-01-06 03:00:00 UTC
  // 2026-01-07 00:00:00 BRT = 2026-01-07 03:00:00 UTC
  const startUTC = '2026-01-06T03:00:00.000Z';
  const endUTC = '2026-01-07T03:00:00.000Z';
  
  // Query sale_items joined with sales to apply the logic
  const { data, error } = await supabase
    .from('sale_items')
    .select(`
      subtotal,
      total,
      sale_type,
      sales!inner (
        sale_date,
        status
      )
    `)
    .neq('sales.status', 'cancelada')
    .gte('sales.sale_date', startUTC)
    .lt('sales.sale_date', endUTC);

  if (error) {
    console.error("Error fetching sales:", error.message);
  } else {
    let totalRevenue = 0;
    
    data.forEach(item => {
      // Logic from Dashboard:
      // If Type 03 (Package Consumption), use subtotal.
      // Else, use total.
      const val = item.sale_type === '03' ? item.subtotal : item.total;
      totalRevenue += val;
    });

    console.log(`Sales Count: ${new Set(data.map(d => d.sales.sale_date)).size} (approx - grouping by date/time might not match exactly row count if many items)`);
    console.log(`Items Count: ${data.length}`);
    console.log(`Total Revenue (Receita Gerada): ${totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  }
}

calcSalesTotalToday();
