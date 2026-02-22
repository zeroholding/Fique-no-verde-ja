const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres', ssl: false });

async function verify() {
    await client.connect();
    
    // Find the latest imported sales
    const res = await client.query(`
        SELECT s.id, s.total, s.subtotal, s.commission_amount, s.sale_date, s.created_at, u.first_name, c.name as client
        FROM sales s
        JOIN users u ON s.attendant_id = u.id
        JOIN clients c ON s.client_id = c.id
        WHERE s.total = 0 AND s.subtotal > 0
        ORDER BY s.created_at DESC
        LIMIT 3
    `);

    res.rows.forEach(r => {
        console.log(`Sale ID: ${r.id}`);
        console.log(`- Attendant: ${r.first_name} | Client: ${r.client}`);
        console.log(`- Total: R$ ${r.total} | Subtotal (Value of Credits): R$ ${r.subtotal} | Commission: R$ ${r.commission_amount}`);
        console.log(`- Sale Date: ${r.sale_date}`);
        console.log(`- Created At: ${r.created_at}\n`);
    });

    await client.end();
}
verify();
