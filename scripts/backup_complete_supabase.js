const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load env vars
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const parseEnv = (key) => {
  const regex = new RegExp(`${key}=["']?([^"'\n]+)["']?`);
  const match = envContent.match(regex);
  return match ? match[1] : null;
};

const supabaseUrl = parseEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseServiceKey = parseEnv('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TABLES = [
  { name: 'sales', order: 'sale_date.desc', pageSize: 1000 },
  { name: 'sale_items', order: 'created_at.desc', pageSize: 1000 },
  { name: 'clients', order: 'created_at.desc', pageSize: 1000 },
  { name: 'client_packages', order: 'created_at.desc', pageSize: 1000 },
  { name: 'package_consumptions', order: 'consumed_at.desc', pageSize: 1000 },
  { name: 'commissions', order: 'created_at.desc', pageSize: 1000 },
  { name: 'users', order: 'created_at.desc', pageSize: 1000 },
  { name: 'services', order: 'created_at.desc', pageSize: 1000 },
  { name: 'products', order: 'created_at.desc', pageSize: 1000 },
  { name: 'commission_policies', order: 'created_at.desc', pageSize: 1000 },
  { name: 'client_origins', order: 'created_at.desc', pageSize: 1000 },
  { name: 'holidays', order: 'created_at.desc', pageSize: 1000 }
];

async function fetchAllData(table, order, pageSize) {
  const allData = [];
  let from = 0;
  
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(order.split('.')[0], { ascending: order.includes('asc') })
      .range(from, from + pageSize - 1);
    
    if (error) {
      console.log(`   ⚠️  Erro: ${error.message}`);
      break;
    }
    
    if (!data || data.length === 0) break;
    
    allData.push(...data);
    
    if (data.length < pageSize) break;
    from += pageSize;
    
    if (from % 5000 === 0) {
      process.stdout.write(` (${allData.length})`);
    }
  }
  
  return allData;
}

async function backupComplete() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '..', 'backups');
  const backupFile = path.join(backupDir, `full_backup_before_import_${timestamp}.json`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backup = {
    timestamp: new Date().toISOString(),
    database: 'supabase',
    url: supabaseUrl,
    tables: {}
  };

  console.log('🔌 Conectando ao Supabase...\n');

  for (const { name: table, order, pageSize } of TABLES) {
    process.stdout.write(`📦 Backup: ${table}... `);
    
    try {
      const data = await fetchAllData(table, order, pageSize);
      
      backup.tables[table] = {
        count: data.length,
        data: data
      };
      
      console.log(`✅ ${data.length} registros`);
    } catch (err) {
      console.log(`❌ Erro: ${err.message}`);
      backup.tables[table] = { count: 0, data: [], error: err.message };
    }
  }

  // Salvar arquivo
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));

  console.log(`\n✅ Backup completo salvo em:`);
  console.log(`   ${backupFile}`);
  
  const stats = fs.statSync(backupFile);
  console.log(`\n📊 Estatísticas:`);
  console.log(`   Tamanho: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Tabelas: ${Object.keys(backup.tables).length}`);
  
  let totalRecords = 0;
  Object.entries(backup.tables).forEach(([table, info]) => {
    if (info.count > 0) {
      console.log(`   • ${table}: ${info.count} registros`);
      totalRecords += info.count;
    }
  });
  
  console.log(`\n   📈 Total: ${totalRecords} registros`);
  console.log(`\n🛡️  Backup concluído com sucesso!`);
  console.log(`   Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
}

backupComplete().catch(err => {
  console.error('\n❌ Erro:', err);
  process.exit(1);
});
