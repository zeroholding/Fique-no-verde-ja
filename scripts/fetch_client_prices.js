const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres' });

async function run() {
    await client.connect();
    try {
        const targetNames = ['TM', 'J3', 'FLASH'];
        const summaries = [];

        for (const name of targetNames) {
            const clientRes = await client.query(`SELECT id, name FROM clients WHERE name ILIKE $1`, [`%${name}%`]);
            // Filter to get the most plausible match
            const c = clientRes.rows.find(row => row.name.toUpperCase() === name) || 
                      clientRes.rows.find(row => row.name.toUpperCase().includes(name));
            
            if (!c) continue;

            // Simulate dashboard summary logic
            // Purchases
            const pkgs = await client.query(`
                SELECT cp.total_paid as value, cp.initial_quantity as quantity
                FROM client_packages cp
                JOIN sales s ON cp.sale_id = s.id
                WHERE cp.client_id = $1 AND s.status != 'cancelada'
            `, [c.id]);

            // Consumptions
            const cons = await client.query(`
                SELECT pc.total_value as value, pc.quantity
                FROM package_consumptions pc
                JOIN client_packages cp ON pc.package_id = cp.id
                JOIN sales s ON pc.sale_id = s.id
                WHERE cp.client_id = $1 AND s.status != 'cancelada'
            `, [c.id]);

            let totalValue = 0;
            let totalQty = 0;

            pkgs.rows.forEach(r => {
                totalValue += Number(r.value);
                totalQty += Number(r.quantity);
            });

            cons.rows.forEach(r => {
                totalValue -= Number(r.value);
                totalQty -= Number(r.quantity);
            });

            const avg = totalQty > 0 ? totalValue / totalQty : 0;
            
            // Also get the base price of the active package
            const activePkg = await client.query(`SELECT unit_price FROM client_packages WHERE client_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`, [c.id]);

            summaries.push({
                name: c.name,
                qty: totalQty,
                financial: totalValue,
                avg: avg,
                basePrice: activePkg.rows[0] ? Number(activePkg.rows[0].unit_price) : null
            });
        }

        console.log(JSON.stringify(summaries, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
