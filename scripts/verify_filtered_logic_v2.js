
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
});

async function run() {
  await client.connect();
  try {
    const cRes = await client.query(`SELECT id FROM clients WHERE name ILIKE '%J3%'`);
    const j3Id = cRes.rows[0].id;
    console.log(`Verifying EXISTS Logic for J3...`);

    const sql = `
      SELECT
        cp.initial_quantity,
        (cp.initial_quantity - COALESCE(
          (SELECT SUM(pc.quantity) 
           FROM package_consumptions pc 
           JOIN sales s2 ON pc.sale_id = s2.id 
           WHERE pc.package_id = cp.id 
           AND s2.status != 'cancelada'
           AND EXISTS (SELECT 1 FROM users u WHERE u.id = s2.attendant_id) 
           AND EXISTS (SELECT 1 FROM clients ec WHERE ec.id = s2.client_id)
          ), 0
        )) as calculated_available
      FROM client_packages cp
      WHERE cp.client_id = $1
    `;
    
    const res = await client.query(sql, [j3Id]);
    const row = res.rows[0];
    
    console.log(`Calculated Available: ${row.calculated_available}`);
    console.log(`Expected: 510`);
    
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
