
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
});

async function run() {
  await client.connect();
  const tmId = '4be828e2-86a2-4bc9-a909-e5212c809ef8';

  try {
    console.log("Simulating Updated API Logic on Prod DB (5434)...");
    
    // The Exact Logic pushed to /api/packages/route.ts
    const sql = `
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
        cp.initial_quantity,
        cp.consumed_quantity,
        cp.available_quantity as static_avail,
        COALESCE(irs.total_qty, 0) as invisible_reloads,
        (cp.available_quantity + COALESCE(irs.total_qty, 0)) as calculated_available
      FROM client_packages cp
      LEFT JOIN invisible_reloads_sum irs ON cp.client_id = irs.client_id
      WHERE cp.client_id = $1
    `;

    const res = await client.query(sql, [tmId]);
    const row = res.rows[0];

    console.log("--- RESULT ---");
    console.log(`Static Available (Old): ${row.static_avail}`);
    console.log(`Invisible Reloads:     +${row.invisible_reloads}`);
    console.log(`Calculated Available (New): ${row.calculated_available}`);
    console.log("-----------------------");
    console.log(`Does it match User's 269?`)
    const diff = Number(row.calculated_available) - 269;
    console.log(`Difference: ${diff}`);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
