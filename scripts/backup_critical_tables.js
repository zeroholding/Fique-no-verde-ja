const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Hardcoded connection string from previous context
const connectionString = 'postgres://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';

const client = new Client({
  connectionString: connectionString,
  ssl: false // Disable SSL as per instructions
});

async function backup() {
  try {
    await client.connect();
    console.log('Connected to database for backup...');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '../backups', timestamp);

    if (!fs.existsSync(backupDir)){
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const tables = ['client_packages', 'package_consumptions', 'sales', 'sale_items', 'clients'];

    for (const table of tables) {
        console.log(`Backing up ${table}...`);
        const res = await client.query(`SELECT * FROM ${table}`);
        const filePath = path.join(backupDir, `${table}.json`);
        fs.writeFileSync(filePath, JSON.stringify(res.rows, null, 2));
        console.log(`Saved ${table} to ${filePath} (${res.rowCount} rows)`);
    }

    console.log(`\nBackup completed successfully in: ${backupDir}`);

  } catch (err) {
    console.error('Backup failed:', err);
  } finally {
    await client.end();
  }
}

backup();
