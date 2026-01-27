
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '../backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
  connectionTimeoutMillis: 10000
});

async function run() {
  console.log("Iniciando Backup JSON dos Dados Críticos (Prod 5434)...");
  await client.connect();
  
  try {
    const tables = ['client_packages', 'sales', 'sale_items', 'package_consumptions', 'clients'];
    const backupData = {};

    for (const table of tables) {
        console.log(`Baixando tabela ${table}...`);
        const res = await client.query(`SELECT * FROM ${table}`);
        backupData[table] = res.rows;
    }

    const filename = path.join(BACKUP_DIR, `json_backup_${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify(backupData, null, 2));
    console.log(`Backup salvo em: ${filename}`);
    
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
