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

async function findDiscount200() {
  console.log("Searching for discount of 200 on 2026-01-06...");
  
  const startUTC = '2026-01-06T03:00:00.000Z';
  const endUTC = '2026-01-07T03:00:00.000Z';
  
  const { data: sales, error } = await supabase
    .from('sales')
    .select(`
      id,
      sale_date,
      total_discount,
      attendant_id,
      users:attendant_id (
        first_name,
        last_name,
        email
      )
    `)
    .neq('status', 'cancelada')
    // We search for exactly 200 or close to it just in case
    .or(`total_discount.eq.200`) 
    .gte('sale_date', startUTC)
    .lt('sale_date', endUTC);

  if (error) {
    console.error("Error fetching sales:", error.message);
    return;
  }

  if (sales.length === 0) {
      console.log("No sale found with exactly 200 discount today. Checking approximate...");
      // Check wider range? Or maybe it was 200 sum?
      // For now let's report 0.
  }

  sales.forEach(s => {
      const attendantName = s.users 
          ? `${s.users.first_name || ''} ${s.users.last_name || ''}`.trim() || s.users.email
          : 'Unknown Attendant';
          
      // Convert to BRT for display
      const date = new Date(s.sale_date);
      const localTime = date.getTime() - (3 * 60 * 60 * 1000); 
      const localDate = new Date(localTime);
      const hour = String(localDate.getUTCHours()).padStart(2, '0');
      const minute = String(localDate.getUTCMinutes()).padStart(2, '0');

      console.log(`FOUND SALE!`);
      console.log(`ID: ${s.id}`);
      console.log(`Attendant: ${attendantName}`);
      console.log(`Time: ${hour}:${minute}`);
      console.log(`Discount: ${s.total_discount}`);
  });
}

findDiscount200();
