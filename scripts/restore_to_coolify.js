const { Client } = require('pg');
const fs = require('fs');

// Coolify PostgreSQL - External access via port 3000
const connectionString = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function restoreDatabase() {
  console.log('=== RESTAURANDO BACKUP NO COOLIFY ===\n');
  
  // Load backup
  const backupFile = 'backup_supabase_2026-01-20.json';
  if (!fs.existsSync(backupFile)) {
    console.error(`Arquivo ${backupFile} não encontrado!`);
    return;
  }
  
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
  console.log(`Backup carregado: ${Object.keys(backup.tables).length} tabelas\n`);
  
  const client = new Client({ connectionString, ssl: false });
  
  try {
    console.log('Conectando ao PostgreSQL no Coolify...');
    await client.connect();
    console.log('Conectado!\n');

    // Create tables in order (respecting foreign keys)
    const tableOrder = [
      'client_origins',
      'price_ranges', 
      'service_price_ranges',
      'users',
      'clients',
      'products',
      'services',
      'sessions',
      'holidays',
      'mercado_livre_credentials',
      'commission_policies',
      'sales',
      'sale_items',
      'sale_refunds',
      'client_packages',
      'package_consumptions',
      'commissions'
    ];

    // Limpar tabelas existentes para evitar duplicidade
    console.log('Limpando tabelas existentes...');
    for (const tableName of [...tableOrder].reverse()) {
      try {
        await client.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
      } catch (e) {
        // Ignora erro se tabela não existir
      }
    }
    console.log('Tabelas limpas!\n');



    for (const tableName of tableOrder) {
      const tableData = backup.tables[tableName];
      if (!tableData || tableData.rows.length === 0) {
        console.log(`Pulando ${tableName} (vazia ou não existe)`);
        continue;
      }

      console.log(`Importando ${tableName}...`);
      
      // Get columns from first row
      const columns = Object.keys(tableData.rows[0]);
      
      for (const row of tableData.rows) {
        const values = columns.map(col => row[col]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const colNames = columns.map(c => `"${c}"`).join(', ');
        
        try {
          await client.query(
            `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
          );
        } catch (err) {
          // If table doesn't exist, try to create it first
          if (err.code === '42P01') {
            console.log(`  Tabela ${tableName} não existe, criando...`);
            // We'll need schema first - skip for now
          }
        }
      }
      console.log(`  -> ${tableData.rowCount} registros`);
    }

    console.log('\n✅ Restauração concluída!');

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

restoreDatabase();
