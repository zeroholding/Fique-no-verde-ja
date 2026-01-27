
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
});

async function run() {
  await client.connect();
  
  try {
    const cRes = await client.query(`SELECT id FROM clients WHERE name ILIKE '%J3%'`);
    const j3Id = cRes.rows[0].id;
    
    console.log(`Checking Null EndClient Consumptions for J3...`);

    // Records that HAVE Attendant (Visible in prev step) but MIGHT be missing End Client
    const nullClientRes = await client.query(`
        SELECT SUM(pc.quantity) as qty
        FROM package_consumptions pc
        JOIN sales s ON pc.sale_id = s.id
        JOIN client_packages cp ON pc.package_id = cp.id
        JOIN users u ON s.attendant_id = u.id -- Has Attendant
        LEFT JOIN clients ec ON s.client_id = ec.id -- Left Join to check null
        WHERE cp.client_id = $1
        AND s.status != 'cancelada'
        AND ec.id IS NULL -- Missing End Client
    `, [j3Id]);
    
    const hiddenByClient = Number(nullClientRes.rows[0]?.qty || 0);

    console.log(`Hidden by Null EndClient (But Has Attendant): ${hiddenByClient}`);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
