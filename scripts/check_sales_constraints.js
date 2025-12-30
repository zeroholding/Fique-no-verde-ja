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

async function check() {
  const query = `
    SELECT conname, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'sales'::regclass
  `;
  const { data, error } = await supabase.rpc('exec_sql', { query });
  if (error) console.error(error);
  else console.log(data);
}
check();
