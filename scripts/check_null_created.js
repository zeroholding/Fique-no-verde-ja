const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres' });

async function run() {
    await client.connect();
    try {
        const res = await client.query(`
            SELECT count(*) as total,
                   count(created_at) as has_created,
                   count(*) - count(created_at) as null_created
            FROM sales
        `);
        console.log(res.rows[0]);

        if (res.rows[0].null_created > 0) {
             const nulls = await client.query(`SELECT id, sale_date FROM sales WHERE created_at IS NULL LIMIT 5`);
             console.log('Sample NULLs:', nulls.rows);
        }
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
