
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
});

async function run() {
  await client.connect();
  
  try {
    const cRes = await client.query(`SELECT id FROM clients WHERE name ILIKE '%J3%'`);
    const j3Id = cRes.rows[0].id;
    
    console.log(`Verifying Filtered Logic for J3...`);

    // The logic pushed to API
    const sql = `
      SELECT
        cp.initial_quantity,
        (cp.initial_quantity - COALESCE(
          (SELECT SUM(pc.quantity) 
           FROM package_consumptions pc 
           JOIN sales s2 ON pc.sale_id = s2.id 
           WHERE pc.package_id = cp.id 
           AND s2.status != 'cancelada'
           AND s2.attendant_id IS NOT NULL 
           AND s2.client_id IS NOT NULL 
          ), 0
        )) as calculated_available
      FROM client_packages cp
      WHERE cp.client_id = $1
    `;
    
    const res = await client.query(sql, [j3Id]);
    const row = res.rows[0];
    
    console.log(`Initial: ${row.initial_quantity}`);
    console.log(`Calculated Available (With Filters): ${row.calculated_available}`);
    console.log(`Expected (Dashboard): 510`);
    
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
