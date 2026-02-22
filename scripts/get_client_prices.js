const { Client } = require('pg');

const client = new Client({ 
    connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
    ssl: false 
});

async function run() {
    await client.connect();
    try {
        const query = `
            SELECT c.name, cp.unit_price, cp.created_at
            FROM client_packages cp
            JOIN clients c ON cp.client_id = c.id
            ORDER BY c.name, cp.created_at DESC;
        `;
        const res = await client.query(query);
        res.rows.forEach(r => {
            console.log(r.name + ': R$ ' + r.unit_price + ' (Criado em ' + r.created_at.toISOString().split('T')[0] + ')');
        });
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

run();
