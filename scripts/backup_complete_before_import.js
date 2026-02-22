const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuração do banco Coolify
const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';

const TABLES = [
  'sales',
  'sale_items', 
  'clients',
  'client_packages',
  'package_consumptions',
  'commissions',
  'users',
  'services',
  'products',
  'commission_policies',
  'client_origins',
  'holidays'
];

async function backupComplete() {
  const client = new Client({ 
    connectionString: coolifyConn, 
    ssl: false 
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '..', 'backups');
  const backupFile = path.join(backupDir, `full_backup_before_import_${timestamp}.json`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backup = {
    timestamp: new Date().toISOString(),
    database: 'postgres',
    host: '72.61.62.227:5433',
    tables: {}
  };

  try {
    await client.connect();
    console.log('🔌 Conectado ao banco de dados\n');

    for (const table of TABLES) {
      process.stdout.write(`📦 Fazendo backup da tabela: ${table}... `);
      
      try {
        // Verificar se tabela existe
        const checkRes = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `, [table]);

        if (!checkRes.rows[0].exists) {
          console.log('⚠️  Tabela não existe, pulando...');
          continue;
        }

        // Contar registros
        const countRes = await client.query(`SELECT COUNT(*) FROM "${table}"`);
        const count = parseInt(countRes.rows[0].count);

        // Buscar todos os dados
        const dataRes = await client.query(`SELECT * FROM "${table}"`);

        backup.tables[table] = {
          count: count,
          data: dataRes.rows
        };

        console.log(`✅ ${count} registros`);
      } catch (err) {
        console.log(`❌ Erro: ${err.message}`);
      }
    }

    // Salvar arquivo de backup
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));

    console.log(`\n✅ Backup completo salvo em:`);
    console.log(`   ${backupFile}`);
    
    const stats = fs.statSync(backupFile);
    console.log(`\n📊 Estatísticas do backup:`);
    console.log(`   Tamanho: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    Object.entries(backup.tables).forEach(([table, info]) => {
      console.log(`   • ${table}: ${info.count} registros`);
    });

    console.log(`\n🛡️  Backup concluído com sucesso!`);
    console.log(`   Data/Hora: ${new Date().toLocaleString('pt-BR')}`);

  } catch (error) {
    console.error('\n❌ Erro durante o backup:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

backupComplete();
