const { Client } = require('pg');

const connectionString = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';

async function inspectSale(saleId, label) {
    const client = new Client({ connectionString });
    await client.connect();

    try {
        console.log(`\n=== INSPECTING SALE (${label}): ${saleId} ===`);

        // 1. Sale Details
        const saleRes = await client.query(`
            SELECT * FROM sales WHERE id = $1
        `, [saleId]);
        
        if (saleRes.rows.length === 0) {
            console.log("Sale NOT FOUND");
            return;
        }
        console.log("SALE HEADER:", saleRes.rows[0]);

        // 2. Sale Items
        const itemsRes = await client.query(`
            SELECT * FROM sale_items WHERE sale_id = $1
        `, [saleId]);
        console.log("SALE ITEMS:", itemsRes.rows);

        // 3. Commissions
        const commRes = await client.query(`
            SELECT * FROM commissions WHERE sale_id = $1
        `, [saleId]);
        console.log("COMMISSIONS:", commRes.rows);

        // 4. Check for Refunds (if specific table exists, otherwise rely on fields)
        /* 
           Note: I don't know if 'refunds' table exists or if it's just 'refund_total' in sales.
           I'll try to guess a 'sales_refunds' or 'refunds' table, but rely mainly on the columns.
        */

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

async function run() {
    await inspectSale('d11312e2-5723-46cf-b132-fac7ff3bee9e', 'WRONG');
    await inspectSale('fbb50ba1-5ee9-4e2c-bdb5-f9876eef2627', 'CORRECT');
}

run();
