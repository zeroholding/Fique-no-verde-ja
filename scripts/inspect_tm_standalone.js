const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/fiquenoverdeja",
});

async function query(text, params) {
  return pool.query(text, params);
}

async function check() {
    try {
        console.log("Checking Client TM...");
        // 1. Find Client TM
        const clientRes = await query(`SELECT id, name FROM clients WHERE name ILIKE '%TM%'`);
        if (clientRes.rows.length === 0) {
            console.log('Client TM not found');
            return;
        }
        
        const client = clientRes.rows[0];
        console.log(`Found Client: ${client.name} (${client.id})`);

        // 2. Check Packages
        const pkgRes = await query(`SELECT id, client_id, available_quantity, unit_price, initial_quantity, consumed_quantity, total_paid FROM client_packages WHERE client_id = $1`, [client.id]);
        console.log('\nPackages for Client ' + client.name + ':');
        console.table(pkgRes.rows);

        // 3. Re-Verify Dashboard Logic (from previous step 16194)
        // Dashboard uses: balanceQuantityCurrent = available_quantity
        // New Sale Modal uses: ??? (Need to check code)
        
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
