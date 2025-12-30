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
  const { data: p, error } = await supabase.from('products').select('id, name');
  if (error) {
      console.log('Error fetching products:', error.message);
      // Try 'services' again but maybe I missed it?
  } else {
      console.log('Products:', p ? p.length : 'None');
      if(p) p.forEach(x => console.log(' - ' + x.name));
  }
}
check();
