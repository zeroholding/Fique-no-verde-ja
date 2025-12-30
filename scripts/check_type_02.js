const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Manually load env vars
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const parseEnv = (key) => {
  const regex = new RegExp(`${key}=["']?([^"'\n]+)["']?`);
  const match = envContent.match(regex);
  return match ? match[1] : null;
};

const supabaseUrl = parseEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseServiceKey = parseEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkType02Sales() {
  try {
    console.log("Checking for Sales of Type '02' (Package Sales)...");

    const query = `
      SELECT 
        s.id, 
        s.sale_date, 
        s.status,
        c.name as client_name,
        si.sale_type,
        si.product_name,
        si.total
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      JOIN clients c ON s.client_id = c.id
      WHERE si.sale_type = '02'
      ORDER BY s.sale_date DESC
      LIMIT 20
    `;

    const { data, error } = await supabase.rpc('exec_sql', { query });
    
    console.log("\n--- Introspecting Sales Table ---");
    const introspectionQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sales'
    `;
    const schemaRes = await supabase.rpc('exec_sql', { query: introspectionQuery });
    console.table(schemaRes.data);
    return;
    console.log("\n--- Searching for Tables with 'package' ---");
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%pack%'
    `;
    const tablesRes = await supabase.rpc('exec_sql', { query: tablesQuery });
    console.table(tablesRes.data);

    console.log("\n--- Searching for Clients (Carriers) ---");
    const carriers = ['J3', 'PEX', 'LVM', 'MECONNECT', 'SOS', 'TM'];
    const clientQuery = `
      SELECT id, name 
      FROM clients 
      WHERE name ILIKE ANY (ARRAY[${carriers.map(c => `'%${c}%'`).join(',')}])
    `;
    const clientRes = await supabase.rpc('exec_sql', { query: clientQuery });
    console.table(clientRes.data);

    if (clientRes.data && clientRes.data.length > 0) {
      const clientIds = clientRes.data.map(c => `'${c.id}'`).join(',');
      console.log("\n--- Checking Sales for these Clients ---");
      const salesQuery = `
        SELECT s.id, s.sale_date, si.sale_type, si.product_name, si.total
        FROM sales s
        LEFT JOIN sale_items si ON si.sale_id = s.id
        WHERE s.client_id IN (${clientIds})
        ORDER BY s.sale_date DESC
        LIMIT 20
      `;
      const salesRes = await supabase.rpc('exec_sql', { query: salesQuery });
      console.table(salesRes.data);
    }

    console.log("\n--- Checking 'packages' table ---");
    const pkgTableQuery = `SELECT * FROM packages LIMIT 10`;
    const pkgTableRes = await supabase.rpc('exec_sql', { query: pkgTableQuery });
    console.table(pkgTableRes.data || []);

    return;

    // Verify sales linked to existing packages
    console.log("\n--- Checking Sales linked to Client Packages ---");
    const linkedQuery = `
      SELECT 
        cp.id as package_id,
        cp.initial_quantity,
        c.name as client_name,
        s.sale_date,
        si.sale_type,
        si.product_name,
        serv.name as service_name
      FROM client_packages cp
      JOIN clients c ON cp.client_id = c.id
      JOIN sales s ON cp.sale_id = s.id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN services serv ON cp.service_id = serv.id
      ORDER BY s.sale_date DESC
      LIMIT 20
    `;
    
    const linkedRes = await supabase.rpc('exec_sql', { query: linkedQuery });
    if (linkedRes.error) console.error("RPC Error (Linked):", linkedRes.error);
    
    const linkedData = linkedRes.data || [];
    console.table(linkedData);
    
    // Count how many packages have which sale_type
    const countQuery = `
      SELECT si.sale_type, COUNT(*) 
      FROM client_packages cp
      JOIN sales s ON cp.sale_id = s.id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      GROUP BY si.sale_type
    `;
    const countRes = await supabase.rpc('exec_sql', { query: countQuery });
    console.log("\n--- Sale Types of Client Packages ---");
    console.table(countRes.data || []);

  } catch (err) {
    console.error("Error:", err);
  }
}

checkType02Sales();
