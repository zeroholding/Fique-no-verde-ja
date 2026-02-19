const { Client } = require('pg');

const client = new Client({ connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres' });

async function run() {
    await client.connect();
    try {
        console.log("=== Discrepancy Investigation V2 ===");
        
        const clientRes = await client.query(`SELECT id, name FROM clients WHERE name ILIKE '%TM%'`);
        const clientId = clientRes.rows[0].id;

        // 1. Get DB Values (What Dashboard Shows)
        const dbRes = await client.query(`
            SELECT id, initial_quantity, consumed_quantity, available_quantity 
            FROM client_packages 
            WHERE client_id = $1 AND is_active = true
        `, [clientId]);
        
        const dbPackage = dbRes.rows[0]; // Assuming only one active for now
        console.log(`DB Initial: ${dbPackage.initial_quantity}`);
        console.log(`DB Consumed: ${dbPackage.consumed_quantity}`);
        console.log(`DB Available: ${dbPackage.available_quantity} (Target: 661)`);

        // 2. Get API Calculated Values (What New Sale Shows)
        const consumptionFilter = `
            AND s2.status != 'cancelada'
            AND EXISTS (SELECT 1 FROM users u WHERE u.id = s2.attendant_id)
            AND EXISTS (SELECT 1 FROM clients ec WHERE ec.id = s2.client_id)
        `;

        const apiRes = await client.query(`
            SELECT SUM(pc.quantity) as api_consumed
            FROM package_consumptions pc
            JOIN sales s2 ON pc.sale_id = s2.id
            WHERE pc.package_id = $1
            ${consumptionFilter}
        `, [dbPackage.id]);

        const apiConsumed = Number(apiRes.rows[0].api_consumed || 0);
        const apiAvailable = dbPackage.initial_quantity - apiConsumed;
        
        console.log(`API Consumed: ${apiConsumed}`);
        console.log(`API Available: ${apiAvailable} (Expected Discrepancy: 764)`);

        const diff = dbPackage.consumed_quantity - apiConsumed;
        console.log(`\nDiscrepancy (DB Consumed - API Consumed): ${diff} credits.`);

        if (diff > 0) {
            console.log("\n--- Analyzing the 'Missing' Consumptions ---");
            console.log("These are consumptions counted in DB but ignored by API filter.");
            
            // Find them
            const missingRes = await client.query(`
                SELECT 
                    pc.quantity,
                    s2.id as sale_id, 
                    s2.status,
                    s2.attendant_id,
                    u.first_name as attendant_name,
                    s2.client_id,
                    c.name as client_name,
                    (SELECT COUNT(*) FROM users WHERE id = s2.attendant_id) as user_exists,
                    (SELECT COUNT(*) FROM clients WHERE id = s2.client_id) as client_exists
                FROM package_consumptions pc
                JOIN sales s2 ON pc.sale_id = s2.id
                LEFT JOIN users u ON s2.attendant_id = u.id
                LEFT JOIN clients c ON s2.client_id = c.id
                WHERE pc.package_id = $1
                AND NOT (
                    s2.status != 'cancelada'
                    AND EXISTS (SELECT 1 FROM users u WHERE u.id = s2.attendant_id)
                    AND EXISTS (SELECT 1 FROM clients ec WHERE ec.id = s2.client_id)
                )
            `, [dbPackage.id]);

            missingRes.rows.forEach(r => {
                const reason = [];
                if (r.status === 'cancelada') reason.push("Status Cancelada (Check if DB counts canceled?)");
                if (r.user_exists == 0) reason.push("Attendant NOT FOUND (Deleted user?)");
                if (r.client_exists == 0) reason.push("Client NOT FOUND (Deleted client?)");
                
                console.log(`Qty: ${r.quantity} | Sale: ${r.sale_id} | Reason: ${reason.join(', ')}`);
            });
            
             const missingSum = missingRes.rows.reduce((acc, r) => acc + Number(r.quantity), 0);
             console.log(`Sum of identified missing rows: ${missingSum}`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
