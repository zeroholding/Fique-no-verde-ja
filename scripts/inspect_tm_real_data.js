const { Client } = require('pg');

// Credentials from analyze_inventory_skew.js as pointed out by user
const client = new Client({ connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres' });

async function run() {
    await client.connect();
    try {
        console.log("Checking Client TM...");
        // 1. Find Client TM
        const clientRes = await client.query(`SELECT id, name FROM clients WHERE name ILIKE '%TM%'`);
        if (clientRes.rows.length === 0) {
            console.log('Client TM not found');
            return;
        }
        
        const c = clientRes.rows[0];
        console.log(`Found Client: ${c.name} (${c.id})`);

        // 2. Fetch ALL packages for this client
        // The dashboard sums up 'available_quantity' of ALL items in client_packages (active or not? logic in route.ts was: SELECT ... FROM client_packages)
        // Let's check raw data.
        const pkgRes = await client.query(`
            SELECT 
                id, 
                is_active,
                created_at, 
                unit_price, 
                initial_quantity, 
                consumed_quantity, 
                available_quantity,
                total_paid
            FROM client_packages 
            WHERE client_id = $1
            ORDER BY created_at DESC
        `, [c.id]);

        console.log('\nPackages for Client ' + c.name + ':');
        console.table(pkgRes.rows);

        // 3. Calculate Totals
        const totalAvailable = pkgRes.rows.reduce((acc, p) => acc + Number(p.available_quantity), 0);
        console.log(`\nTotal Available (Sum of all packages): ${totalAvailable}`);

        const totalActiveAvailable = pkgRes.rows
            .filter(p => p.is_active)
            .reduce((acc, p) => acc + Number(p.available_quantity), 0);
        console.log(`Total Available (Active only): ${totalActiveAvailable}`);

        // 4. Debugging the 764 vs 661
        // 764 - 661 = 103?
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
