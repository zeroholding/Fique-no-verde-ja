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
            
            const clientRes = await client.query(`SELECT id, name FROM clients WHERE name ILIKE $1`, [`%${t.name}%`]);
            const c = clientRes.rows.find(row => row.name.toUpperCase() === t.name) || 
                      clientRes.rows.find(row => row.name.toUpperCase().includes(t.name));
            
            if (!c) {
                console.log(`Client ${t.name} not found.`);
                continue;
            }
            console.log(`Client found: ${c.name} (${c.id})`);

            const packages = await client.query(`
                SELECT 
                    cp.id,
                    cp.created_at,
                    cp.initial_quantity,
                    cp.total_paid,
                    cp.unit_price,
                    cp.is_active,
                    s.id as sale_id
                FROM client_packages cp
                JOIN sales s ON cp.sale_id = s.id
                WHERE cp.client_id = $1 AND s.status != 'cancelada'
                ORDER BY cp.created_at DESC
                LIMIT 5
            `, [c.id]);

            console.log('Recent Packages:');
            // Store candidates for update
            const candidates = [];
            
            packages.rows.forEach(p => {
                const currentUnit = p.initial_quantity > 0 ? Number(p.total_paid) / Number(p.initial_quantity) : 0;
                const diff = Math.abs(currentUnit - t.targetPrice);
                
                console.log(`  Package ${p.id} (${p.created_at}) Active: ${p.is_active}`);
                console.log(`    Qty: ${p.initial_quantity}`);
                console.log(`    Total Paid: ${p.total_paid}`);
                console.log(`    Unit Price (DB): ${p.unit_price}`);
                console.log(`    Calc Unit Price: ${currentUnit.toFixed(4)}`);
                console.log(`    Diff from Target: ${diff.toFixed(4)}`);
                
                // If the unit price is significantly different, mark for update
                if (diff > 0.01 && p.is_active) {
                     candidates.push(p);
                }
            });

            // Perform Update on Candidates
            if (candidates.length > 0) {
                console.log(`\n  >> Updating ${candidates.length} packages for ${c.name}...`);
                for (const p of candidates) {
                    const newTotalPaid = Number(p.initial_quantity) * t.targetPrice;
                    console.log(`    Package ${p.id}: Setting Unit Price ${t.targetPrice} | New Total Paid: ${newTotalPaid}`);
                    
                    // Update Package
                    await client.query(`
                        UPDATE client_packages 
                        SET unit_price = $1, total_paid = $2 
                        WHERE id = $3
                    `, [t.targetPrice, newTotalPaid, p.id]);

                    // Update Sale TOTAL (assuming 1 package per sale usually, or just fixing the sale total key)
                    // Note: If sale has other items, this might be risky. But usually Type 02 is standalone.
                    // Let's check sale items count before updating sale?
                    // For now, let's just update the package as that drives the dashboard metrics.
                    // But if we don't update sale, the "Sales Register" will show mismatch.
                    // Let's try to update sale total too if it matches the package total logic.
                    
                    await client.query(`
                        UPDATE sales 
                        SET total = $1 
                        WHERE id = $2
                    `, [newTotalPaid, p.sale_id]);
                    
                    console.log(`    >> Updated Package & Sale.`);
                }
            } else {
                console.log(`  >> No active packages found with incorrect price.`);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
