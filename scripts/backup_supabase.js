const { Client } = require('pg');
const fs = require('fs');

const connectionString = 'postgresql://postgres:mmSpgjWDXtTSPjtM@db.xqkhmtrxcpjmxtwpqacg.supabase.co:5432/postgres';

async function backupDatabase() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  
  try {
    console.log('Conectando ao Supabase...');
    await client.connect();
    console.log('Conectado!\n');

    // Get all tables
    const tablesResult = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    
    const tables = tablesResult.rows.map(r => r.table_name);
    console.log(`Encontradas ${tables.length} tabelas: ${tables.join(', ')}\n`);

    const backup = { exportedAt: new Date().toISOString(), tables: {} };

    for (const table of tables) {
      console.log(`Exportando ${table}...`);
      const result = await client.query(`SELECT * FROM "${table}"`);
      backup.tables[table] = {
        rowCount: result.rows.length,
        rows: result.rows
      };
      console.log(`  -> ${result.rows.length} registros`);
    }

    // Save to file
    const filename = `backup_supabase_${new Date().toISOString().slice(0,10)}.json`;
    fs.writeFileSync(filename, JSON.stringify(backup, null, 2));
    console.log(`\n✅ Backup salvo em: ${filename}`);
    console.log(`Tamanho: ${(fs.statSync(filename).size / 1024 / 1024).toFixed(2)} MB`);

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

backupDatabase();
