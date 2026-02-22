const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';
const client = new Client({ connectionString: coolifyConn, ssl: false });

async function rollbackType03() {
    await client.connect();
    console.log("=== ROLLING BACK INCORRECT TYPE 03 IMPORT ===");
    
    try {
        await client.query('BEGIN');

        // 1. Find the target sales inserted today for Type 03
        const targetSalesRes = await client.query(`
            SELECT s.id 
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            WHERE s.created_at >= '2026-02-21 16:00:00+00' 
              AND si.sale_type = '03'
        `);
        
        if (targetSalesRes.rows.length === 0) {
            console.log("No sales found to rollback.");
            return;
        }

        const saleIds = targetSalesRes.rows.map(r => r.id);
        console.log(`Found ${saleIds.length} sales to rollback.`);

        // 2. Find associated consumptions to refund packages
        const consRes = await client.query(`
            SELECT package_id, quantity FROM package_consumptions 
            WHERE sale_id = ANY($1::uuid[])
        `, [saleIds]);
        
        const refundMap = new Map();
        consRes.rows.forEach(c => {
            if (!refundMap.has(c.package_id)) refundMap.set(c.package_id, 0);
            refundMap.set(c.package_id, refundMap.get(c.package_id) + Number(c.quantity));
        });

        // 3. Refund packages
        for (const [pkgId, qty] of refundMap.entries()) {
            await client.query(`
                UPDATE client_packages
                SET available_quantity = available_quantity + $1,
                    consumed_quantity = consumed_quantity - $1
                WHERE id = $2
            `, [qty, pkgId]);
            console.log(`Refunded ${qty} credits to package ${pkgId}`);
        }

        // 4. Delete Consumptions
        const delCons = await client.query(`DELETE FROM package_consumptions WHERE sale_id = ANY($1::uuid[])`, [saleIds]);
        console.log(`Deleted ${delCons.rowCount} consumptions.`);
        
        // 5. Delete Sale Items
        const delItems = await client.query(`DELETE FROM sale_items WHERE sale_id = ANY($1::uuid[])`, [saleIds]);
        console.log(`Deleted ${delItems.rowCount} sale items.`);

        // 6. Delete Sales
        const delSales = await client.query(`DELETE FROM sales WHERE id = ANY($1::uuid[])`, [saleIds]);
        console.log(`Deleted ${delSales.rowCount} sales.`);

        await client.query('COMMIT');
        console.log("✅ Rollback successful.");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ Rollback failed!", e);
    } finally {
        await client.end();
    }
}

rollbackType03();
