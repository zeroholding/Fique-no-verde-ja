
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
});

async function run() {
  await client.connect();
  const tmId = '4be828e2-86a2-4bc9-a909-e5212c809ef8';
  // I need J3 ID.
  // I'll fetch J3 ID again.
  
  try {
    const cRes = await client.query(`SELECT id FROM clients WHERE name ILIKE '%J3%'`);
    const j3Id = cRes.rows[0].id;
    
    console.log(`Checking Null Attendant Consumptions for J3 (${j3Id})...`);

    // 1. Total Active Consumptions (Status != cancelada)
    const totalRes = await client.query(`
        SELECT SUM(pc.quantity) as qty
        FROM package_consumptions pc
        JOIN sales s ON pc.sale_id = s.id
        JOIN client_packages cp ON pc.package_id = cp.id
        WHERE cp.client_id = $1
        AND s.status != 'cancelada'
    `, [j3Id]);
    const totalActive = Number(totalRes.rows[0]?.qty || 0);

    // 2. Active Consumptions WITH Attendant (Inner Join equivalent)
    const attendantRes = await client.query(`
        SELECT SUM(pc.quantity) as qty
        FROM package_consumptions pc
        JOIN sales s ON pc.sale_id = s.id
        JOIN client_packages cp ON pc.package_id = cp.id
        JOIN users u ON s.attendant_id = u.id -- INNER JOIN
        WHERE cp.client_id = $1
        AND s.status != 'cancelada'
    `, [j3Id]);
    const withAttendant = Number(attendantRes.rows[0]?.qty || 0);

    // 3. Difference
    const diff = totalActive - withAttendant;
    
    console.log(`Total Active Consumptions: ${totalActive}`);
    console.log(`Visible in Dash (Has Attendant): ${withAttendant}`);
    console.log(`Hidden (Null/Invalid Attendant): ${diff}`);
    
    if (diff === 1000) {
        console.log("CONFIRMED: 1000 Consumptions are hidden because 'attendant_id' is missing or invalid.");
    } else {
        console.log("Hypothesis failed or partial match.");
    }

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
