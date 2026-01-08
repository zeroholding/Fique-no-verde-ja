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

async function countSalesToday() {
  console.log("Counting sales for 2026-01-06 (America/Sao_Paulo)...");
  
  // 2026-01-06 00:00:00 BRT = 2026-01-06 03:00:00 UTC
  // 2026-01-07 00:00:00 BRT = 2026-01-07 03:00:00 UTC
  const startUTC = '2026-01-06T03:00:00.000Z';
  const endUTC = '2026-01-07T03:00:00.000Z';
  
  const { count, error } = await supabase
    .from('sales')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'cancelada')
    .gte('sale_date', startUTC)
    .lt('sale_date', endUTC);

  if (error) {
    console.error("Error fetching sales:", error.message);
  } else {
    console.log(`Total Sales Count for 06/01/2026: ${count}`);
  }
}

countSalesToday();
