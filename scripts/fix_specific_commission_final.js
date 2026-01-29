const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres' });

async function run() {
    await client.connect();
    try {
        const saleId = '9ecd2743-0be9-43c8-9d22-324242526ece';
        
        console.log('--- Fixing Commission for Sale: ' + saleId + ' ---');
        
        // Force commission to 0 since it is fully refunded (total = 0)
        // Update both sales table and commissions table
        
        console.log('Zeroing commission in SALES table...');
        await client.query(`UPDATE sales SET commission_amount = 0 WHERE id = $1`, [saleId]);
        
        console.log('Zeroing commission in COMMISSIONS table...');
        const res = await client.query(`
            UPDATE commissions
            SET commission_amount = 0,
                base_amount = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE sale_id = $1
            RETURNING *
        `, [saleId]);

        console.log('Updated Commission Record:', res.rows[0]);

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
