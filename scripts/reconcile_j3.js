
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function recover() {
  const saleId = 'f4c820ca-b207-4e34-92a0-3af99f501abc';
  const pkgId = '83082ac5-7f93-4e89-9a2c-f9e0a0d0d0d0';
  
  try {
    const { data: res } = await supabase.rpc('exec_sql', { 
      query: `SELECT unit_price FROM client_packages WHERE id = '${pkgId}'` 
    });
    
    if (!res || res.length === 0) {
        console.log("Package not found");
        return;
    }

    const up = res[0].unit_price;
    const qty = 100300;
    const tv = up * qty;
    
    const sql = `INSERT INTO package_consumptions (package_id, sale_id, quantity, unit_price, total_value, consumed_at) 
                 VALUES ('${pkgId}', '${saleId}', ${qty}, ${up}, ${tv}, NOW())`;
    
    const { error: insertErr } = await supabase.rpc('exec_sql', { query: sql });
    
    if (insertErr) {
        console.error("Insert error:", insertErr);
    } else {
        console.log("SUCCESS: Reconciled J3 consumption record.");
    }

  } catch (e) {
    console.log("ERROR:" + e.message);
  }
}
recover();
