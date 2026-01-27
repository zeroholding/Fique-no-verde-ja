
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
});

async function run() {
  await client.connect();
  try {
    const namePart = 'J3';
    // Get Client
    const cRes = await client.query(`SELECT id, name FROM clients WHERE name ILIKE $1`, [`%${namePart}%`]);
    const j3 = cRes.rows[0];
    if (!j3) return console.log("J3 not found");
    const id = j3.id;
    console.log(`Analyzing Client: ${j3.name} (${id})`);

    // 1. Packages
    const pkgRes = await client.query(`SELECT id, initial_quantity, consumed_quantity, available_quantity FROM client_packages WHERE client_id = $1`, [id]);
    console.log("\n--- Client Packages ---");
    console.table(pkgRes.rows);
    const totalInitial = pkgRes.rows.reduce((sum, r) => sum + Number(r.initial_quantity), 0);
    
    // 2. Invisible Reloads
    const invRes = await client.query(`
        SELECT SUM(si.quantity) as val
        FROM sales s
        JOIN sale_items si ON s.id = si.sale_id
        WHERE si.sale_type = '02' 
        AND s.status != 'cancelada'
        AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE sale_id IS NOT NULL)
        AND s.client_id = $1
    `, [id]);
    const invisible = Number(invRes.rows[0]?.val || 0);
    console.log(`\nInvisible Reloads Sum: ${invisible}`);

    // 3. Consumptions
    const consRes = await client.query(`
        SELECT 
            s.status,
            SUM(pc.quantity) as qty
        FROM package_consumptions pc
        JOIN sales s ON pc.sale_id = s.id
        JOIN client_packages cp ON pc.package_id = cp.id
        WHERE cp.client_id = $1
        GROUP BY s.status
    `, [id]);
    console.log("\n--- Consumptions by Status ---");
    console.table(consRes.rows);
    
    let totalConsumed = 0;
    let activeConsumed = 0;
    consRes.rows.forEach(r => {
        totalConsumed += Number(r.qty);
        if (r.status !== 'cancelada') activeConsumed += Number(r.qty);
    });

    console.log("\n--- RECONSTRUCTION ---");
    console.log(`Dashboard Acquired (User sees 1936).`);
    console.log(`DB Initial: ${totalInitial}`);
    console.log(`DB Invisible: ${invisible}`);
    console.log(`Sum Initial + Invisible: ${totalInitial + invisible}`);
    console.log(`Logic (If Base assumes Invis included): Initial (${totalInitial})`);
    
    console.log(`Dashboard Consumed (User sees 1426).`);
    console.log(`DB Active Consumed: ${activeConsumed}`);
    console.log(`DB Total Consumed: ${totalConsumed}`);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
