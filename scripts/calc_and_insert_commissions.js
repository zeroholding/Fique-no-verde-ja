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

const HOLIDAYS = new Set([
  '2025-01-01', '2025-03-03', '2025-03-04', '2025-04-18', '2025-04-21', 
  '2025-05-01', '2025-06-19', '2025-09-07', '2025-10-12', '2025-11-02', 
  '2025-11-15', '2025-11-20', '2025-12-25'
]);

function isWeekendOrHoliday(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const day = d.getUTCDay(); // 0=Sun, 6=Sat
    const isoDate = dateStr.split('T')[0];
    return (day === 0 || day === 6 || HOLIDAYS.has(isoDate));
}

async function run() {
    console.log("Fetching Items...");
    let allItems = [];
    let from = 0;
    while(true) {
        const { data, error } = await supabase.from('sale_items').select('id, sale_id, total, quantity, sale_type, sales (id, sale_date, attendant_id, status)').range(from, from + 999);
        if (error || !data.length) break;
        allItems = allItems.concat(data);
        if (data.length < 1000) break;
        from += 1000;
    }
    console.log(`Processing ${allItems.length} items...`);
    
    const entries = [];
    for (const item of allItems) {
        const sale = Array.isArray(item.sales) ? item.sales[0] : item.sales;
        if (!sale || !sale.attendant_id || sale.status === 'canceled') continue;
        
        const isSpecial = isWeekendOrHoliday(sale.sale_date);
        let val = 0;
        
        if (item.sale_type === '03') {
            val = 0.25 * (item.quantity || 1);
        } else {
            val = (item.total || 0) * (isSpecial ? 0.10 : 0.025);
        }
        
        if (val > 0) {
            entries.push({
                sale_id: sale.id,
                sale_item_id: item.id,
                user_id: sale.attendant_id,
                commission_amount: parseFloat(val.toFixed(2)),
                base_amount: item.total || 0,
                commission_type: item.sale_type === '03' ? 'fixed_unit' : 'percent',
                commission_rate: item.sale_type === '03' ? 0.25 : (isSpecial ? 10 : 2.5), 
                status: 'pending',
                reference_date: sale.sale_date,
                created_at: new Date().toISOString()
            });
        }
    }
    
    console.log(`Inserting ${entries.length} commissions...`);
    for (let i = 0; i < entries.length; i += 100) {
        const batch = entries.slice(i, i + 100);
        const { error } = await supabase.from('commissions').insert(batch);
        if (error) console.error("Batch error:", error.message);
        else process.stdout.write('.');
    }
    console.log("\nDone.");
}

run();
