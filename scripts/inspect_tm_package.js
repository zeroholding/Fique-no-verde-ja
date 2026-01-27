
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres',
});

async function run() {
  await client.connect();
  try {
    // 1. Get TM ID
    const tmClient = await client.query("SELECT id, name FROM clients WHERE name = 'TM'");
    const tmId = tmClient.rows[0].id;
    console.log(`TM Client ID: ${tmId}`);

    // 2. Get Raw Client Packages
    const res = await client.query(`
      SELECT id, initial_quantity, consumed_quantity, available_quantity, created_at 
      FROM client_packages 
      WHERE client_id = $1
    `, [tmId]);

    console.log("\n--- Raw 'client_packages' Table Data ---");
    console.table(res.rows);

    // 3. Get Dashboard Calculated Balance (Simulated)
    const dbRes = await client.query(`
        WITH invisible_reloads_sum AS (
            SELECT 
                s.client_id, 
                SUM(si.quantity) as total_qty
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            WHERE si.sale_type = '02' 
            AND s.status != 'cancelada'
            AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE sale_id IS NOT NULL)
            GROUP BY s.client_id
        )
        SELECT
          (cp.initial_quantity - COALESCE(irs.total_qty, 0)) AS calculated_base_qty,
           COALESCE(irs.total_qty, 0) as deducted_invisible_reloads
        FROM client_packages cp
        LEFT JOIN invisible_reloads_sum irs ON cp.client_id = irs.client_id
        WHERE cp.client_id = $1
    `, [tmId]);
    
    console.log("\n--- Dashboard 'Base' Logic ---");
    console.log(dbRes.rows[0]);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
