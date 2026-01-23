
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres',
});

async function verifyBalances() {
  await client.connect();
  console.log("Connected to VPS Database (72.61.62.227)");

  try {
    const clientsToCheck = ['TM', 'J3', 'FLASH', 'MECONECT', 'SOS', 'W.A', 'FLEXBOYS', 'D44', 'WDK', 'PEX', 'LVM', 'FASTFLEX', 'M3'];

    // This query mimics the logic we implemented in the statement API:
    // 1. Get initial packages (legacy)
    // 2. UNION with Type 02 sales (reloads) that are NOT linked in client_packages
    // 3. Subtract consumptions
    
    // Simplification for total balance check:
    // Total Acquired = (Sum of client_packages.initial_quantity) + (Sum of unlinked Type 02 sales quantities)
    // Total Consumed = Sum of package_consumptions.quantity
    // Balance = Acquired - Consumed
    
    for (const clientName of clientsToCheck) {
        console.log(`\n--- Checking ${clientName} ---`);
        
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
        // Logic: Sales of type 02, where the sale_id is NOT present in client_packages
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
        const resConsumptions = await client.query(`
            SELECT SUM(quantity) as total_consumed
            FROM package_consumptions pc
            JOIN client_packages cp ON pc.package_id = cp.id
            WHERE cp.client_id = $1
        `, [clientId]);
        const totalConsumed = Number(resConsumptions.rows[0].total_consumed || 0);

        const totalAcquired = initialFromPackages + initialFromReloads;
        const balance = totalAcquired - totalConsumed;

        console.log(`Initial from Packages (Legacy/Linked): ${initialFromPackages}`);
        console.log(`Invisible Reloads (Type 02 Unlinked): ${initialFromReloads}`);
        console.log(`Total Acquired: ${totalAcquired}`);
        console.log(`Total Consumed: ${totalConsumed}`);
        console.log(`CALCULATED BALANCE: ${balance}`);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

verifyBalances();
