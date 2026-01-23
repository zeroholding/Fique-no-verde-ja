
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5432/postgres',
});

async function checkSOS() {
  try {
    await client.connect();
    console.log("Connected to Port 5432");

    const res = await client.query(`
      SELECT 
        (SELECT SUM(initial_quantity) FROM client_packages WHERE client_id = (SELECT id FROM clients WHERE name = 'SOS')) as initial,
        (SELECT SUM(quantity) FROM package_consumptions WHERE client_package_id IN (SELECT id FROM client_packages WHERE client_id = (SELECT id FROM clients WHERE name = 'SOS'))) as consumed
    `);
    
    // Also check for the "invisible reloads" on this DB
    const resReloads = await client.query(`
        SELECT SUM(si.quantity) as total_reload
        FROM sales s
        JOIN sale_items si ON s.id = si.sale_id
        WHERE s.client_id = (SELECT id FROM clients WHERE name = 'SOS')
        AND si.sale_type = '02'
        AND s.status != 'cancelada'
        AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE client_id = (SELECT id FROM clients WHERE name = 'SOS') AND sale_id IS NOT NULL)
    `);

    const initial = Number(res.rows[0].initial || 0);
    const reloads = Number(resReloads.rows[0].total_reload || 0);
    const consumed = Number(res.rows[0].consumed || 0);
    
    console.log(`SOS Balance Check on Port 5432:`);
    console.log(`Initial: ${initial}`);
    console.log(`Reloads (Invisible): ${reloads}`);
    console.log(`Consumed: ${consumed}`);
    console.log(`Calculated Balance: ${initial + reloads - consumed}`);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkSOS();
