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

function isWeekend(dateStr) {
    // Need to handle timezone carefully. The sales are stored as UTC string but represent BRT moments.
    // However, usually "sale_date" is just a timestamp. 
    // Assuming simple UTC date check for now, or better:
    // If sale_date is 2025-07-29T10:00:00Z, that's Tuesday.
    const d = new Date(dateStr);
    const day = d.getDay(); // 0-6
    return day === 0 || day === 6;
}

// Rates
const RATE_WEEKDAY = 0.025; // 2.5%
const RATE_WEEKEND = 0.10;  // 10%

async function updateCommissions() {
  console.log("UPDATING Commissions (01/01/2025 - 30/11/2025)...\n");

  const startDate = '2025-01-01T00:00:00.000Z';
  const endDate = '2025-11-30T23:59:59.999Z';

  // Fetch all relevant sales
  // Getting all at once might be too big, let's paginate or fetch ID+Total+Date first
  let allSales = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('sales')
      .select('id, sale_date, total, status, sale_items!inner(sale_type)')
      .gte('sale_date', startDate)
      .lte('sale_date', endDate)
      .neq('status', 'cancelada')
      .eq('sale_items.sale_type', '01') 
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("Fetch error:", error.message);
      return;
    }

    if (data && data.length > 0) {
      // De-duplicate because join returns rows per item
      const uniqueSales = [];
      const seen = new Set();
      data.forEach(s => {
          if (!seen.has(s.id)) {
              seen.add(s.id);
              uniqueSales.push(s);
          }
      });
      allSales = allSales.concat(uniqueSales);
      page++;
      hasMore = data.length === pageSize;
      console.log(`Fetched page ${page}... (${allSales.length} total so far)`);
    } else {
      hasMore = false;
    }
  }

  console.log(`\nFound ${allSales.length} sales to process.`);

  let updatedCount = 0;
  let errorCount = 0;

  // Process Updates
  for (const sale of allSales) {
      if (!sale.total) continue;

      const isWknd = isWeekend(sale.sale_date);
      const rate = isWknd ? RATE_WEEKEND : RATE_WEEKDAY;
      const newCommission = parseFloat((sale.total * rate).toFixed(2));

      // Update DB
      const { error } = await supabase
        .from('sales')
        .update({ commission_amount: newCommission })
        .eq('id', sale.id);

      if (error) {
          console.error(`Failed to update sale ${sale.id}: ${error.message}`);
          errorCount++;
      } else {
          updatedCount++;
          if (updatedCount % 100 === 0) process.stdout.write('.');
      }
  }

  console.log(`\n\n✅ DONE! Updated ${updatedCount} sales.`);
  console.log(`❌ Errors: ${errorCount}`);
}

updateCommissions();
