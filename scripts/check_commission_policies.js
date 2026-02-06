const { Client } = require('pg');
const connectionString = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';

async function checkPolicies() {
    const client = new Client({ connectionString });
    await client.connect();

    try {
        console.log("=== CHECKING PRODUCTS 'ATRASO' ===");
        const services = await client.query(`SELECT id, name FROM services WHERE name ILIKE '%atraso%'`);
        console.table(services.rows);

        const serviceIds = services.rows.map(s => s.id);

        if (serviceIds.length > 0) {
            console.log("\n=== CHECKING POLICIES FOR THESE SERVICES ===");
            const policies = await client.query(`
                SELECT * FROM commission_policies 
                WHERE product_id = ANY($1::uuid[])
            `, [serviceIds]);
            console.table(policies.rows);
        } else {
            console.log("No services found matching 'atraso'.");
        }

        console.log("\n=== CHECKING ALL TYPE 03 POLICIES ===");
        const type03Policies = await client.query(`
            SELECT * FROM commission_policies 
            WHERE sale_type = '03'
        `);
        console.table(type03Policies.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

checkPolicies();
