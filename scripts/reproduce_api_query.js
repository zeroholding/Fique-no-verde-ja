const { Client } = require('pg');

// Credentials from analyze_inventory_skew.js
const client = new Client({ connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres' });

async function run() {
    await client.connect();
    try {
        console.log("Reproducing API Logic for Client TM...");
        
        // 1. Find Client TM
        const clientRes = await client.query(`SELECT id, name FROM clients WHERE name ILIKE '%TM%'`);
        if (clientRes.rows.length === 0) return;
        const clientId = clientRes.rows[0].id;
        console.log(`Client ID: ${clientId}`);

        // 2. Run Exact API Query Logic
        const consumptionFilter = `
            AND s2.status != 'cancelada'
            AND EXISTS (SELECT 1 FROM users u WHERE u.id = s2.attendant_id) -- Mimic INNER JOIN users
            AND EXISTS (SELECT 1 FROM clients ec WHERE ec.id = s2.client_id) -- Mimic INNER JOIN clients
        `;

        const sql = `
            SELECT
                cp.id,
                cp.initial_quantity,
                cp.consumed_quantity as db_consumed,
                cp.available_quantity as db_available,
                
                -- Calculated Consumed (API Logic)
                COALESCE(
                  (SELECT SUM(pc.quantity) 
                   FROM package_consumptions pc 
                   JOIN sales s2 ON pc.sale_id = s2.id 
                   WHERE pc.package_id = cp.id 
                   ${consumptionFilter}
                  ), 0
                ) as api_consumed,

                -- Calculated Available (API Logic)
                (cp.initial_quantity - COALESCE(
                  (SELECT SUM(pc.quantity) 
                   FROM package_consumptions pc 
                   JOIN sales s2 ON pc.sale_id = s2.id 
                   WHERE pc.package_id = cp.id 
                   ${consumptionFilter}
                  ), 0
                )) as api_available

            FROM client_packages cp
            WHERE cp.client_id = $1 AND cp.is_active = true
        `;

        const res = await client.query(sql, [clientId]);
        console.table(res.rows);

        // 3. Find the missing 103 credits
        console.log("\n--- Searching for the discrepancy (The 'Ignored' Consumptions) ---");
        // Logic: Consumptions that exist in DB but fail the filter
        const discrepancySql = `
            SELECT 
                pc.quantity,
                s2.id as sale_id,
                s2.status,
                s2.attendant_id,
                u.id as user_exists,
                s2.client_id,
                c.id as client_exists,
                pc.created_at
            FROM package_consumptions pc
            JOIN sales s2 ON pc.sale_id = s2.id
            LEFT JOIN users u ON s2.attendant_id = u.id
            LEFT JOIN clients c ON s2.client_id = c.id
            WHERE pc.package_id IN (SELECT id FROM client_packages WHERE client_id = $1)
            AND NOT (
                s2.status != 'cancelada'
                AND u.id IS NOT NULL 
                AND c.id IS NOT NULL
            )
        `;
        
        const discRes = await client.query(discrepancySql, [clientId]);
        if (discRes.rows.length > 0) {
            console.log(`Found ${discRes.rows.length} ignored consumptions:`);
            console.table(discRes.rows);
            
            const totalIgnored = discRes.rows.reduce((acc, r) => acc + Number(r.quantity), 0);
            console.log(`Total Ignored: ${totalIgnored}`);
        } else {
            console.log("No discrepant consumptions found via SQL logic.");
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
