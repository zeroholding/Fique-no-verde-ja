const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Manually load env vars
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

async function addBirthDateColumn() {
  console.log("Checking if 'birth_date' column exists...");
  
  const checkQuery = `
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'clients' AND column_name = 'birth_date'
  `;
  const { data, error } = await supabase.rpc('exec_sql', { query: checkQuery });

  if (error) {
    console.error("Error checking column:", error);
    return;
  }

  if (data && data.length > 0) {
    console.log("Column 'birth_date' already exists.");
  } else {
    console.log("Column 'birth_date' does not exist. Adding...");
    const alterQuery = `ALTER TABLE clients ADD COLUMN birth_date DATE`;
    const alterRes = await supabase.rpc('exec_sql', { query: alterQuery });
    
    if (alterRes.error) {
       console.error("Error adding column:", alterRes.error);
    } else {
       console.log("✅ Column 'birth_date' added successfully.");
    }
  }
}

addBirthDateColumn();
