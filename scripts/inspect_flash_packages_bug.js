const { Client } = require('pg');

const connectionString = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';

async function run() {
    const client = new Client({ connectionString });
    await client.connect();
    try {
        console.log(`--- Listing first 10 items in sale_items ---`);

        const res = await client.query(`
            SELECT * FROM sale_items LIMIT 10
        `);

        console.log(JSON.stringify(res.rows));

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
