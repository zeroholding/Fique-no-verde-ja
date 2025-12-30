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
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function query(text, params = []) {
  let processedText = text;
  if (params.length > 0) {
    for (let index = params.length - 1; index >= 0; index--) {
      const placeholder = `$${index + 1}`;
      const param = params[index];
      let value;
      if (typeof param === 'string') value = `'${param}'`; // Simple escape for this script
      else value = String(param);
      
      processedText = processedText.replace(placeholder, value);
    }
  }
  
  const { data, error } = await supabase.rpc('exec_sql', { query: processedText });
  if (error) throw error;
  return { rows: data || [] };
}

async function verifyMetrics() {
  try {
    console.log("Connecting to Supabase...");
    
    // 1. Get User ID
    const userRes = await query("SELECT id, first_name, last_name FROM users WHERE first_name ILIKE '%Gianlucca%'");
    if (userRes.rows.length === 0) {
      console.log("User not found.");
      return;
    }
    const user = userRes.rows[0];
    console.log(`User: ${user.first_name} ${user.last_name} (${user.id})`);

    // 2. Query Metrics (Last 180 Days)
    const metricsQuery = `
      SELECT
        COALESCE(
          SUM(CASE WHEN si.sale_type = '03' THEN si.subtotal ELSE si.total END),
          0
        )::numeric AS total_value,
        COALESCE(SUM(si.quantity), 0)::int AS total_quantity,
        COUNT(DISTINCT s.id) AS sales_count
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN services serv ON si.product_id = serv.id
      WHERE s.status != 'cancelada'
        AND s.attendant_id = '${user.id}'
        AND s.sale_date >= CURRENT_DATE - 180 * INTERVAL '1 day'
    `;

    const metricsRes = await query(metricsQuery);
    const metrics = metricsRes.rows[0];

    console.log("\n--- Metrics (Last 180 Days) ---");
    console.log(`Receita Bruta: R$ ${metrics.total_value}`);
    console.log(`Atendimentos: ${metrics.sales_count}`);
    console.log(`Remoções: ${metrics.total_quantity}`);

  } catch (err) {
    console.error("Error:", err);
  }
}

verifyMetrics();
