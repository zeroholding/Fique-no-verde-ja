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

async function dumpSales() {
  console.log("Dumping sales for 2026-01-05 and 2026-01-06 (Broad Range)...");
  
  // Broad range in UTC to catch everything around these dates
  const startUTC = '2026-01-05T00:00:00.000Z'; 
  const endUTC = '2026-01-07T12:00:00.000Z'; 
  
  const { data, error } = await supabase
    .from('sales')
    .select('id, sale_date, status, total')
    .neq('status', 'cancelada')
    .gte('sale_date', startUTC)
    .lt('sale_date', endUTC)
    .order('sale_date', { ascending: true });

  if (error) {
    console.error("Error fetching sales:", error.message);
    return;
  }

  console.log(`Found ${data.length} sales in broad window.`);
  
  let count05 = 0;
  let count06 = 0;
  let count07 = 0;
  
  data.forEach(s => {
    // Manually Convert to BRT (UTC-3)
    const date = new Date(s.sale_date);
    // Adjust -3 hours manually to "simulate" BRT perception
    const localTime = date.getTime() - (3 * 60 * 60 * 1000); 
    const localDate = new Date(localTime);
    
    const day = localDate.getUTCDate();
    const month = localDate.getUTCMonth() + 1;
    const hour = localDate.getUTCHours();
    
    const dateStr = `${day}/${month} ${hour}h`;
    
    if (day === 5) count05++;
    if (day === 6) count06++;
    if (day === 7) count07++;
    
    // Log items near the boundary of 05/06 and 06/07
    console.log(`[${s.id.slice(0,6)}] UTC: ${s.sale_date} | Local ~: ${DayToString(day)} ${hour}h | Total: ${s.total}`);
  });
  
  console.log("--- Summary (Local BRT inference) ---");
  console.log(`Day 05: ${count05}`);
  console.log(`Day 06: ${count06}`);
  console.log(`Day 07: ${count07}`);
  console.log(`Total (05+06): ${count05 + count06}`);
}

function DayToString(d) {
    return d < 10 ? `0${d}` : d;
}

dumpSales();
