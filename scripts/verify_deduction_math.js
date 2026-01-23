
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres',
});

async function verifyMath() {
  await client.connect();
  console.log("Connected to VPS Database (Port 5433 - for math validataion)");

  try {
    const clientsToCheck = ['TM', 'J3'];

    for (const clientName of clientsToCheck) {
        console.log(`\n--- Checking ${clientName} ---`);
        
        const resClient = await client.query("SELECT id FROM clients WHERE name = $1", [clientName]);
        if (resClient.rows.length === 0) continue;
        const clientId = resClient.rows[0].id;

        // 1. Total in Packages (Legacy + Updates)
        const resPackages = await client.query(`
            SELECT SUM(initial_quantity) as total_initial 
            FROM client_packages 
            WHERE client_id = $1
        `, [clientId]);
        const currentInitial = Number(resPackages.rows[0].total_initial || 0);

        // 2. Invisible Reloads (Type 02 Sales unlinked)
        // These are the ones I WANT to show securely.
        const resReloads = await client.query(`
            SELECT SUM(si.quantity) as total_reload
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            WHERE s.client_id = $1
            AND si.sale_type = '02'
            AND s.status != 'cancelada'
            AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE client_id = $1 AND sale_id IS NOT NULL)
        `, [clientId]);
        const reloads = Number(resReloads.rows[0].total_reload || 0);

        const deducedBase = currentInitial - reloads;

        console.log(`Current Package Sudo-Total: ${currentInitial} (Matches User Screenshot)`);
        console.log(`Found Invisible Reloads: ${reloads}`);
        console.log(`Proposed Base (Initial - Reloads): ${deducedBase}`);
        console.log(`Check: ${deducedBase} + ${reloads} = ${deducedBase + reloads}`);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

verifyMath();
