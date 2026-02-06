const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres' });

async function run() {
    await client.connect();
    try {
        const targets = ['TM', 'J3', 'FLASH'];

        for (const name of targets) {
            console.log(`\n\n=== ANALYZING ${name} ===`);
            
            // Get Client ID
            const clientRes = await client.query(`SELECT id, name FROM clients WHERE name ILIKE $1`, [`%${name}%`]);
            const c = clientRes.rows.find(row => row.name.toUpperCase() === name) || 
                      clientRes.rows.find(row => row.name.toUpperCase().includes(name));
            if (!c) continue;

            console.log(`Client: ${c.name} (${c.id})`);

            // Fetch ALL active packages
            const pkgs = await client.query(`
                SELECT 
                    id, 
                    created_at, 
                    unit_price, 
                    initial_quantity, 
                    total_paid
                FROM client_packages 
                WHERE client_id = $1 AND is_active = true
                ORDER BY created_at DESC
            `, [c.id]);

            // Need to calculate "Remaining Balance" per package to see the weighted impact.
            // But DB schema might not store "current_balance" directly on package?
            // Usually dashboard calculates it dynamic: (Initial - Consumed).
            // Let's check `package_consumptions` for each package.

            let totalBalanceConfigured = 0;
            let totalFinancialConfigured = 0;

            for (const p of pkgs.rows) {
                // Get consumption for this package (IGNORING Cancelled Sales)
                const cons = await client.query(`
                    SELECT SUM(pc.quantity) as consumed 
                    FROM package_consumptions pc
                    JOIN sales s ON pc.sale_id = s.id
                    WHERE pc.package_id = $1 AND s.status != 'cancelada'
                `, [p.id]);

                const consumed = Number(cons.rows[0].consumed || 0);
                const initial = Number(p.initial_quantity);
                const balance = initial - consumed;
                const unitPrice = Number(p.unit_price);
                
                // Assuming dashboard logic: Financial Balance = Balance * Unit Price (roughly, or (TotalPaid / Initial) * Balance)
                const effectiveFinancial = balance * unitPrice;

                console.log(`  Pkg ${p.id.substring(0,8)} | Date: ${p.created_at.toISOString().substring(0,10)}`);
                console.log(`    Price: ${unitPrice.toFixed(2)} | Initial: ${initial} | Consumed: ${consumed} | Balance: ${balance}`);
                
                if (balance > 0) {
                    totalBalanceConfigured += balance;
                    totalFinancialConfigured += effectiveFinancial;
                }
            }

            const avg = totalBalanceConfigured > 0 ? totalFinancialConfigured / totalBalanceConfigured : 0;
            console.log(`  >> CALC AVG: ${avg.toFixed(2)} (Total Fin: ${totalFinancialConfigured.toFixed(2)} / Total Qty: ${totalBalanceConfigured})`);
        }

    } catch (err) {
        // If quantity_purchased doesn't exist, we might fail. earlier error said it didn't exist.
        // I'll remove it from the query.
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
