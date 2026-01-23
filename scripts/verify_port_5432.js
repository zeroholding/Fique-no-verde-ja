
const { Client } = require('pg');

// Trying Port 5432 (Standard) with same credentials
const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5432/postgres',
});

async function verifyBalances() {
  console.log("Attempting connection to VPS Database (72.61.62.227) on PORT 5432...");
  try {
    await client.connect();
    console.log("Connected successfully to Port 5432!");

    const clientsToCheck = ['TM', 'J3', 'FLASH', 'MECONECT', 'SOS'];

    for (const clientName of clientsToCheck) {
        console.log(`\n--- Checking ${clientName} (PORT 5432) ---`);
        
        // 1. Get Client ID
        const resClient = await client.query("SELECT id FROM clients WHERE name = $1", [clientName]);
        if (resClient.rows.length === 0) {
            console.log(`Client ${clientName} not found.`);
            continue;
        }
        const clientId = resClient.rows[0].id;

        // 2. Get Base Packages (Legacy)
        const resPackages = await client.query(`
            SELECT SUM(initial_quantity) as total_initial 
            FROM client_packages 
            WHERE client_id = $1
        `, [clientId]);
        const initialFromPackages = Number(resPackages.rows[0].total_initial || 0);

        // 3. Get Unlinked Reloads (Type 02 Sales)
        // Corrected query with si.sale_type
        const resReloads = await client.query(`
            SELECT SUM(si.quantity) as total_reload
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            WHERE s.client_id = $1
            AND si.sale_type = '02'
            AND s.status != 'cancelada'
            AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE client_id = $1 AND sale_id IS NOT NULL)
        `, [clientId]);
        const initialFromReloads = Number(resReloads.rows[0].total_reload || 0);

        // 4. Get Consumptions
        // Corrected query with pc.package_id
        const resConsumptions = await client.query(`
            SELECT SUM(quantity) as total_consumed
            FROM package_consumptions pc
            JOIN client_packages cp ON pc.package_id = cp.id
            WHERE cp.client_id = $1
        `, [clientId]);
        const totalConsumed = Number(resConsumptions.rows[0].total_consumed || 0);

        const totalAcquired = initialFromPackages + initialFromReloads;
        const balance = totalAcquired - totalConsumed;

        console.log(`Initial: ${initialFromPackages}`);
        console.log(`Invisible Reloads: ${initialFromReloads}`);
        console.log(`Acquired: ${totalAcquired}`);
        console.log(`Consumed: ${totalConsumed}`);
        console.log(`CALCULATED BALANCE: ${balance}`);
    }

  } catch (err) {
    console.error('Connection Failed or Error:', err.message);
  } finally {
    await client.end();
  }
}

verifyBalances();
