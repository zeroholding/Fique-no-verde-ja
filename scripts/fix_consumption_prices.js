const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres' });

async function run() {
    await client.connect();
    try {
        const targets = [
            { name: 'TM', targetPrice: 8.50 },
            { name: 'J3', targetPrice: 7.50 },
            { name: 'FLASH', targetPrice: 10.00 }
        ];

        for (const t of targets) {
            console.log(`\n--- Fixing Consumptions for ${t.name} (Target: ${t.targetPrice}) ---`);
            
            const clientRes = await client.query(`SELECT id, name FROM clients WHERE name ILIKE $1`, [`%${t.name}%`]);
            const c = clientRes.rows.find(row => row.name.toUpperCase() === t.name) || 
                      clientRes.rows.find(row => row.name.toUpperCase().includes(t.name));
            
            if (!c) continue;

            // Find Active Packages
            const packages = await client.query(`
                SELECT id 
                FROM client_packages 
                WHERE client_id = $1 AND is_active = true
            `, [c.id]);

            for (const p of packages.rows) {
                console.log(`  Updating Consumptions for Package ${p.id}...`);
                
                const res = await client.query(`
                    UPDATE package_consumptions
                    SET unit_price = $1, 
                        total_value = quantity * $1::numeric
                    WHERE package_id = $2
                    RETURNING id
                `, [t.targetPrice, p.id]);
                
                console.log(`    Updated ${res.rowCount} consumption records.`);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
