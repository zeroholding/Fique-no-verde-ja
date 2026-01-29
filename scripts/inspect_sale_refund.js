const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres' });

async function run() {
    await client.connect();
    try {
        const saleId = '9ecd2743-0be9-43c8-9d22-324242526ece';
        
        console.log('--- Sale Details ---');
        const saleRes = await client.query(`SELECT * FROM sales WHERE id = $1`, [saleId]);
        console.log(saleRes.rows[0]);

        console.log('\n--- Sale Items ---');
        const itemsRes = await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [saleId]);
        console.log(itemsRes.rows);

        console.log('\n--- Commission Logs/Calculations (if any in DB) ---');
        // Check if there is a commissions table or similar
        const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%commission%'`);
        console.log('Tables related to commission:', tables.rows.map(r => r.table_name));
        
        // If 'commissions' exists, check it
        if (tables.rows.some(r => r.table_name === 'commissions')) {
             const commRes = await client.query(`SELECT * FROM commissions WHERE sale_id = $1`, [saleId]);
             console.log(commRes.rows);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
