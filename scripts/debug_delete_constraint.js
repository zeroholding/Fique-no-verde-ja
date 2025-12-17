require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function query(sql) {
  const { data, error } = await supabase.rpc('exec_sql', {
    query: sql
  });
  if (error) {
      console.error("RPC Error:", error);
      throw error;
  }
  return { rows: data };
}

async function run() {
  try {
    console.log("Starting reproduction...");

    // 1. Get a random client ID just to link
    const clientRes = await query("SELECT id FROM clients LIMIT 1");
    if (!clientRes.rows || clientRes.rows.length === 0) throw new Error("No clients found");
    const clientId = clientRes.rows[0].id;
    
    // 2. Get a random attendant
    const userRes = await query("SELECT id FROM users LIMIT 1");
    if (!userRes.rows || userRes.rows.length === 0) throw new Error("No users found");
    const userId = userRes.rows[0].id;

    console.log(`Using Client: ${clientId}, User: ${userId}`);

    // 3. Create a Dummy Sale
    // We construct a raw insert to simulate a sale
    const insertSql = `
      INSERT INTO sales (client_id, attendant_id, sale_date, total, status, payment_method)
      VALUES ('${clientId}', '${userId}', NOW(), 100, 'confirmada', 'dinheiro')
      RETURNING id;
    `;
    
    // Note: exec_sql might not return RETURNING data structure easily depending on how it's written.
    // If it returns 'data' as array of rows, we are good.
    const saleRes = await query(insertSql);
    // Supposing output is array of rows
    const saleId = saleRes.rows[0].id; 
    console.log(`Created Dummy Sale: ${saleId}`);

    // 4. Create a dependency (Commission)
    await query(`
        INSERT INTO commissions (sale_id, user_id, commission_amount, status)
        VALUES ('${saleId}', '${userId}', 10, 'a_pagar')
    `);
    console.log("Created Dependency: Commission");

    // 5. Attempt Delete (Direct SQL, mimicking the API logic order)
    console.log("Attempting Delete...");
    
    try {
        await query("BEGIN");
        // Mimic API Logic order
        // await query(`DELETE FROM commissions WHERE sale_id = '${saleId}'`); -- INTENTIONALLY SKIP TO TRIGGER ERROR IF CONSTRAINT EXISTS
        await query(`DELETE FROM sales WHERE id = '${saleId}'`);
        await query("COMMIT");
        console.log("Delete Successful (Unexpected if constraints exist!)");
    } catch (delError) {
        await query("ROLLBACK");
        console.error("CAUGHT MATCHING ERROR:");
        console.error("Message:", delError.message);
        console.error("Details:", delError.details);
        console.error("Hint:", delError.hint);
        console.error("Code:", delError.code);
    }

    // Cleanup if successful
    await query(`DELETE FROM commissions WHERE sale_id = '${saleId}'`);
    await query(`DELETE FROM sales WHERE id = '${saleId}'`);

  } catch (err) {
    console.error("Script Error:", err);
  }
}

run();
