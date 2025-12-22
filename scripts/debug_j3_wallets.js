
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runQuery(sql) {
  const { data, error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) throw error;
  return data;
}

async function debug() {
  try {
    console.log("--- DEBUG J3 WALLETS ---");

    const j3Results = await runQuery(`
      SELECT cp.*, c.name as client_name, s.name as service_name
      FROM client_packages cp
      JOIN clients c ON cp.client_id = c.id
      JOIN services s ON cp.service_id = s.id
      WHERE c.name ILIKE '%J3%'
      ORDER BY cp.created_at DESC
    `);

    console.log("ALL PACKAGES FOR J3:");
    console.table(j3Results.map(r => ({
        id: r.id,
        service: r.service_name,
        active: r.is_active,
        avail: r.available_quantity,
        consumed: r.consumed_quantity,
        created: r.created_at
    })));

  } catch (err) {
    console.error("Error:", err);
  }
}

debug();
