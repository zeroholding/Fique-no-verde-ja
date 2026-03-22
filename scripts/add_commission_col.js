const { Client } = require('pg');
const connectionString = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';

async function migrate() {
    const client = new Client({ connectionString });
    await client.connect();
    
    try {
        console.log("Adding commission_percentage to cupons table...");
        const res = await client.query(`
            ALTER TABLE cupons 
            ADD COLUMN IF NOT EXISTS commission_percentage NUMERIC DEFAULT 0;
        `);
        console.log("Migration successful.");
        
        // Also describe the table to be sure
        const desc = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'cupons'
        `);
        console.table(desc.rows);
    } catch(e) {
        console.error("Migration failed:", e);
    } finally {
        await client.end();
    }
}

migrate();
