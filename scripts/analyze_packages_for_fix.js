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
            console.log(`\n--- Analyzing ${t.name} (Target: ${t.targetPrice}) ---`);
            
            // Find Client
            const clientRes = await client.query(`SELECT id, name FROM clients WHERE name ILIKE $1`, [`%${t.name}%`]);
            const c = clientRes.rows.find(row => row.name.toUpperCase() === t.name) || 
                      clientRes.rows.find(row => row.name.toUpperCase().includes(t.name));
            
            if (!c) {
                console.log(`Client ${t.name} not found.`);
                continue;
            }
            console.log(`Client found: ${c.name} (${c.id})`);

            // Find Packages (Sales Type 02 usually creates packages)
            // We want to see recent packages that might have the "wrong" unit prices
            const packages = await client.query(`
                SELECT 
                    cp.id,
                    cp.created_at,
                    cp.initial_quantity,
                    cp.quantity_purchased, 
                    cp.total_paid,
                    cp.unit_price,
                    s.id as sale_id,
                    s.total as sale_total
                FROM client_packages cp
                JOIN sales s ON cp.sale_id = s.id
                WHERE cp.client_id = $1 AND s.status != 'cancelada'
                ORDER BY cp.created_at DESC
                LIMIT 5
            `, [c.id]);

            console.log('Recent Packages:');
            packages.rows.forEach(p => {
                const currentUnit = p.initial_quantity > 0 ? Number(p.total_paid) / Number(p.initial_quantity) : 0;
                console.log(`  Package ${p.id} (${p.created_at}):`);
                console.log(`    Qty: ${p.initial_quantity}`);
                console.log(`    Total Paid: ${p.total_paid}`);
                console.log(`    Unit Price (DB): ${p.unit_price}`);
                console.log(`    Calc Unit Price: ${currentUnit.toFixed(4)}`);
                console.log(`    Sale ID: ${p.sale_id}`);
            });
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
