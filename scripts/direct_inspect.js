require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

  const connStr = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;
  console.log("Connection String (Masked):", connStr ? connStr.replace(/:[^:@]+@/, ':***@') : "UNDEFINED");

  const client = new Client({
    connectionString: connStr,
    // Try without SSL first, or check if URL has ?sslmode=require
    // ssl: { rejectUnauthorized: false } 
  });

async function run() {
  try {
    console.log("Connecting directly to DB...");
    await client.connect();
    
    console.log("Inspecting Constraints for 'sales' table...");
    const res = await client.query(`
      SELECT
          conname AS constraint_name,
          conrelid::regclass::text AS table_with_fk,
          confrelid::regclass::text AS referenced_table
      FROM pg_constraint
      WHERE confrelid = 'public.sales'::regclass
    `);

    console.log("Constraints Found:", JSON.stringify(res.rows, null, 2));

    console.log("Listing All Tables (Constraint check):");
    const tables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
    `);
    console.log("Tables:", tables.rows.map(r => r.table_name).join(", "));
    
    await client.end();
  } catch (err) {
    console.error("Direct DB Error:", err);
    process.exit(1);
  }
}

run();
