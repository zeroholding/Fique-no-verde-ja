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

const HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', 
  '2026-05-01', '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02', 
  '2026-11-15', '2026-12-25'
]);

function isWeekendOrHoliday(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const day = d.getUTCDay(); // 0=Sun, 6=Sat
    const isoDate = dateStr.split('T')[0];
    return (day === 0 || day === 6 || HOLIDAYS_2026.has(isoDate));
}

async function run() {
    console.log("=== UPDATING COMMISSION POLICY (2026) ===\n");
    
    // 1. Close Old Policy (3.5% Weekdays)
    console.log("1. Closing old policies (3.5%)...");
    const { error: updateErr } = await supabase
        .from('commission_policies')
        .update({ valid_until: '2025-12-31' })
        .eq('name', 'Comissão Padrão - Dias Úteis')
        .is('valid_until', null);
        
    if (updateErr) console.error("Error closing old policy:", updateErr.message);
    else console.log("Old policies closed (valid_until = 2025-12-31).");
    
    // 2. Insert New Policy (2.5% Weekdays)
    console.log("\n2. Inserting new policy (2.5%)...");
    const { data: newPolicy, error: insertErr } = await supabase
        .from('commission_policies')
        .insert({
            name: 'Comissão Padrão - Dias Úteis', // Same name as requested (or distinguishable?)
            description: 'Comissão de 2,5% sobre vendas em dias úteis (seg-sex) a partir de 2026',
            type: 'percentage',
            value: 2.5,
            scope: 'general',
            applies_to: 'weekdays',
            valid_from: '2026-01-01',
            valid_until: null,
            is_active: true,
            sale_type: 'all'
        })
        .select()
        .single();
        
    if (insertErr) {
        console.error("Error inserting new policy:", insertErr.message);
    } else {
        console.log(`New policy created: ${newPolicy.id}`);
    }
    
    // 3. Recalculate Sales from 2026-01-01
    console.log("\n3. Recalculating sales from 2026-01-01...");
    
    // Fetch sales in 2026
    const { data: sales2026 } = await supabase
        .from('sales')
        .select('id, sale_date, attendant_id')
        .gte('sale_date', '2026-01-01');
        
    console.log(`Found ${sales2026?.length || 0} sales in 2026.`);
    
    if (!sales2026?.length) return;
    
    const saleIds = sales2026.map(s => s.id);
    
    // Fetch items for these sales
    // Only standard items (not type 03 package consumption which uses fixed rate)
    const { data: items } = await supabase
        .from('sale_items')
        .select('id, sale_id, total, sale_type')
        .in('sale_id', saleIds)
        .neq('sale_type', '03'); // Ignore package consumption
        
    console.log(`Found ${items?.length || 0} items to verify.`);
    
    let updatedCount = 0;
    
    for (const item of items) {
        const sale = sales2026.find(s => s.id === item.sale_id);
        if (!sale) continue;
        
        // Skip weekends/holidays (they use 10% policy which hasn't changed)
        if (isWeekendOrHoliday(sale.sale_date)) continue;
        
        // Calculate new commission (2.5%)
        const newRate = 2.5;
        const newAmount = parseFloat(((item.total || 0) * 0.025).toFixed(2));
        
        // Update commission entry in DB
        // We find the commission entry by sale_item_id
        const { error: commUpdateErr } = await supabase
            .from('commissions')
            .update({
                commission_rate: newRate,
                commission_amount: newAmount,
                // updated_at: new Date().toISOString() // if column exists
            })
            .eq('sale_item_id', item.id)
            .eq('commission_type', 'percent'); // Double check
            
        if (commUpdateErr) {
            console.error(`Failed to update item ${item.id}:`, commUpdateErr.message);
        } else {
            updatedCount++;
        }
    }
    
    console.log(`\nUpdated ${updatedCount} commissions to 2.5%.`);
}

run();
