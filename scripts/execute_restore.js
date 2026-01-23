
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres',
});

async function restore() {
  console.log("Connecting to VPS (Port 5433)...");
  await client.connect();
  
  try {
    const sqlPath = path.join(__dirname, '../restore_unified.sql');
    console.log(`Reading SQL file: ${sqlPath}`);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log("Executing Restore (this might take a moment)...");
    
    // Execute the whole script
    await client.query(sql);
    
    console.log("✅ Restore Completed Successfully!");
    
  } catch (err) {
    console.error("❌ Restore Failed:", err);
  } finally {
    await client.end();
  }
}

restore();
