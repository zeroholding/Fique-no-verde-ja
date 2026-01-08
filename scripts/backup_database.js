const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const parseEnv = (key) => {
  const regex = new RegExp(`${key}=["']?([^"'\n]+)["']?`);
  const match = envContent.match(regex);
  return match ? match[1] : null;
};

const supabase = createClient(
  parseEnv('NEXT_PUBLIC_SUPABASE_URL'),
  parseEnv('SUPABASE_SERVICE_ROLE_KEY')
);

// List of known tables in the project (based on previous scripts)
const TABLES = [
  'users',
  'clients',
  'services',
  'sales',
  'sale_items',
  'sale_refunds',
  'commissions',
  'commission_policies',
  'client_packages',
  'package_consumptions',
  'products',
];

async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.resolve(__dirname, `../backup_${timestamp}`);
  
  // Create backup directory
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  console.log(`\n📦 Starting Database Backup...`);
  console.log(`📁 Backup Directory: ${backupDir}\n`);

  let totalRows = 0;
  const summary = [];

  for (const table of TABLES) {
    console.log(`⏳ Backing up table: ${table}...`);
    
    try {
      // Fetch all data from table (paginated for large tables)
      let allData = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
          console.error(`   ❌ Error fetching ${table}: ${error.message}`);
          summary.push({ table, status: 'ERROR', rows: 0, error: error.message });
          break;
        }

        if (data && data.length > 0) {
          allData = allData.concat(data);
          page++;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      // Write to JSON file
      const filePath = path.join(backupDir, `${table}.json`);
      fs.writeFileSync(filePath, JSON.stringify(allData, null, 2), 'utf8');
      
      console.log(`   ✅ ${table}: ${allData.length} rows saved.`);
      summary.push({ table, status: 'OK', rows: allData.length });
      totalRows += allData.length;

    } catch (err) {
      console.error(`   ❌ Unexpected error for ${table}: ${err.message}`);
      summary.push({ table, status: 'ERROR', rows: 0, error: err.message });
    }
  }

  // Write summary
  const summaryPath = path.join(backupDir, '_backup_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    tables: summary,
    totalRows
  }, null, 2), 'utf8');

  console.log(`\n✅ Backup Complete!`);
  console.log(`📊 Total Rows: ${totalRows}`);
  console.log(`📁 Saved to: ${backupDir}`);
}

backupDatabase();
