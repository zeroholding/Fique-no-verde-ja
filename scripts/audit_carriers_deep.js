
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const carriers = {
  "FASTFLEX": "f5f245d4-4eff-4b67-b78d-a3c54b96cd3b",
  "M3": "a715bb6d-0ea9-4ac4-ae06-d03cd4887d66",
  "LVM": "4985ebbf-049a-4700-b800-eb2039f97d88"
};

async function audit() {
  for (const [name, id] of Object.entries(carriers)) {
    console.log(`\n--- AUDIT: ${name} (${id}) ---`);
    
    // 1. Get Packages
    const { data: pkgs } = await s.from('client_packages').select('*').eq('client_id', id);
    console.log("Packages in DB:", JSON.stringify(pkgs, null, 2));
    
    // 2. Get Sales Type 02 (recargas)
    const { data: sales } = await s.from('sales').select('id, sale_date, observations').eq('client_id', id);
    const saleIds = sales.map(s => s.id);
    
    if (saleIds.length > 0) {
        const { data: items } = await s.from('sale_items').select('quantity, sale_id').in('sale_id', saleIds);
        console.log(`Found ${sales.length} sales. Total Items Quantity:`, items.reduce((acc, i) => acc + Number(i.quantity), 0));
        console.log("Sales Details:", JSON.stringify(sales, null, 2));
    } else {
        console.log("No sales found for this client.");
    }
    
    // 3. Get Consumption Logs
    const pkgIds = pkgs.map(p => p.id);
    if (pkgIds.length > 0) {
        const { data: logs } = await s.from('package_consumptions').select('quantity').in('package_id', pkgIds);
        console.log("Historical Consumption Logs (Total Qty):", logs.reduce((acc, l) => acc + Number(l.quantity), 0));
        console.log("Number of consumption records:", logs.length);
    }
  }
}

audit();
