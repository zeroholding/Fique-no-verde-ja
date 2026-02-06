const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres' });

async function run() {
    await client.connect();
    try {
        console.log("Searching for 'MAJU' commissions...");
        // Join with clients to find specific commission
        const res = await client.query(`
            SELECT 
                c.id as comm_id,
                c.reference_date,
                c.created_at as comm_created_at,
                s.sale_date,
                s.created_at as sale_created_at,
                cl.name
            FROM commissions c
            JOIN sales s ON c.sale_id = s.id
            JOIN clients cl ON s.client_id = cl.id
            WHERE cl.name ILIKE '%MAJU%'
            ORDER BY c.created_at DESC
            LIMIT 5
        `);
        
        res.rows.forEach(r => {
            console.log('---');
            console.log(`Client: ${r.name}`);
            console.log(`Comm ID: ${r.comm_id}`);
            console.log(`Reference Date (Raw): ${r.reference_date}`); // JS Date obj (UTC usually printed in Local by Node)
            console.log(`Reference Date (ISO): ${r.reference_date.toISOString()}`);
            console.log(`Sale Date (Raw): ${r.sale_date}`);
            console.log(`Sale Date (ISO): ${r.sale_date.toISOString()}`);
            console.log(`Comm Created: ${r.comm_created_at.toISOString()}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
