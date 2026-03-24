const { Client } = require('pg');
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';

async function migrate() {
    const client = new Client({ connectionString });
    await client.connect();
    
    try {
        console.log("Adding statement_slug to clients table...");
        await client.query(`
            ALTER TABLE clients 
            ADD COLUMN IF NOT EXISTS statement_slug VARCHAR(255) UNIQUE;
        `);
        console.log("Migration successful.");
    } catch(e) {
        console.error("Migration failed:", e);
    } finally {
        await client.end();
    }
}

migrate();
