const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres' });

async function run() {
    await client.connect();
    try {
        const saleId = '9ecd2743-0be9-43c8-9d22-324242526ece';
        
        console.log('--- Fixing Commission for Sale: ' + saleId + ' ---');
        
        // 1. Get current sale status
        const saleRes = await client.query(`SELECT total, commission_amount, refund_total FROM sales WHERE id = $1`, [saleId]);
        const sale = saleRes.rows[0];
        
        if (!sale) {
            console.log('Sale not found.');
            return;
        }

        console.log('Sale Data:', sale);

        // 2. Update commission to match sale data
        const res = await client.query(`
            UPDATE commissions
            SET commission_amount = $1,
                base_amount = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE sale_id = $3
            RETURNING *
        `, [sale.commission_amount, sale.total, saleId]);

        console.log('Updated Commission:', res.rows[0]);

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
