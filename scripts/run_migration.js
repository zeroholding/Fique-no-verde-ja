require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function query(sql) {
  // exec_sql expects { query: string }
  const { data, error } = await supabase.rpc('exec_sql', {
    query: sql
  });
  if (error) throw error;
  return { rows: data };
}

async function run() {
  try {
    console.log("Connecting...");
    
    const sqlPath = path.resolve(__dirname, '../merge_packages_migration.sql');
    
    if (!fs.existsSync(sqlPath)) {
        console.error("Migration file not found at:", sqlPath);
        return;
    }

    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    console.log("Reading migration SQL...");
    console.log("Executing migration against database...");

    // Execute the raw SQL
    await query(sqlContent);
    
    console.log("Migration executed successfully!");
    console.log("Unified Wallet structure applied.");

  } catch (err) {
    console.error("Migration Failed:", err.message);
    if (err.details) console.error("Details:", err.details);
    if (err.hint) console.error("Hint:", err.hint);
  }
}

run();
