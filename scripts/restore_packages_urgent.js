const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

const BACKUP_FILE = 'backup_client_packages_2026-01-23T18-42-37-905Z.json';

async function restoreBackup() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    const backupPath = path.join(__dirname, BACKUP_FILE);
    if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
    }

    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    console.log(`=== RESTAURANDO BACKUP PRE-FIX (${backupData.length} registros) ===\n`);

    await client.connect();
    await client.query('BEGIN');

    for (const pkg of backupData) {
        console.log(`Restaurando PKG ${pkg.id} (Cliente: ${pkg.client_id})...`);
        
        await client.query(`
            UPDATE client_packages
            SET 
                initial_quantity = $1,
                consumed_quantity = $2,
                available_quantity = $3,
                updated_at = NOW()
            WHERE id = $4
        `, [
            pkg.initial_quantity,
            pkg.consumed_quantity,
            pkg.available_quantity,
            pkg.id
        ]);
        
        console.log(`  ✅ Restaurado: Init=${pkg.initial_quantity}, Cons=${pkg.consumed_quantity}, Avail=${pkg.available_quantity}`);
    }

    await client.query('COMMIT');
    console.log('\n🎉 RESTAURAÇÃO CONCLUÍDA COM SUCESSO! OS VALORES ORIGINAIS FORAM RECUPERADOS.');

  } catch (error) {
    console.error('❌ ERRO CRÍTICO:', error.message);
    try { await client.query('ROLLBACK'); } catch(e) {}
  } finally {
    await client.end();
  }
}

restoreBackup();
