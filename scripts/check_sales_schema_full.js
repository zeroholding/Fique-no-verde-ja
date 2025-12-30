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

const supabaseUrl = parseEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseServiceKey = parseEnv('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchema() {
  const tables = ['sales', 'sale_items', 'services', 'clients'];
  for (const table of tables) {
      console.log(`\n--- Schema for ${table} ---`);
      const query = `
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = '${table}'
      `;
      const { data, error } = await supabase.rpc('exec_sql', { query });
      if (error) console.error(error);
      else console.log(JSON.stringify(data, null, 2));
  }
}
checkSchema();
