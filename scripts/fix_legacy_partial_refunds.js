const { Client } = require('pg');

const connectionString = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';

async function fixPartialRefunds() {
    const client = new Client({ connectionString });
    await client.connect();

    try {
        console.log("=== FIXING LEGACY PARTIAL REFUND RETURNS ===");
        
        // Find commissions where calculation is off
        // Logic: commission_amount differs from base_amount * (rate/100) by more than 0.10
        // And Status is 'a_pagar' (Safe to edit)
        const query = `
            SELECT id, sale_id, base_amount, commission_rate, commission_amount
            FROM commissions
            WHERE status = 'a_pagar'
            AND base_amount > 0
            AND commission_rate > 0
            AND ABS(commission_amount - (base_amount * (commission_rate / 100))) > 0.10
        `;

        const res = await client.query(query);
        const toFix = res.rows;

        console.log(`Found ${toFix.length} commissions with calculation errors due to partial refunds.`);

        for (const comm of toFix) {
            const expected = Number(comm.base_amount) * (Number(comm.commission_rate) / 100);
            const diff = Number(comm.commission_amount) - expected;
            
            console.log(`\nFixing Commission ${comm.id} (Sale ${comm.sale_id})`);
            console.log(`Base: ${comm.base_amount} | Rate: ${comm.commission_rate}%`);
            console.log(`Current: ${comm.commission_amount} | Expected: ${expected.toFixed(4)} | Diff: ${diff.toFixed(2)}`);

            // Update Commission
            await client.query(`
                UPDATE commissions 
                SET commission_amount = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [expected, comm.id]);

            // Sync Sales Table
            // Only if this is the only commission or primary one? 
            // Sales table stores aggregated commission_amount. 
            // For now, I will update sales table too with the same value if it matches the current wrong value.
            await client.query(`
                UPDATE sales
                SET commission_amount = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2 AND ABS(commission_amount - $3) < 0.10
            `, [expected, comm.sale_id, comm.commission_amount]);
            
            console.log("-> FIXED.");
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

fixPartialRefunds();
