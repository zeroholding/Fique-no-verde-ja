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

async function inspect() {
    console.log("Checking Client Packages...");
    const { data, error } = await supabase.from('client_packages').select('*').limit(1);
    
    if (error) {
        console.error("Error:", error.message);
    } else {
        if (data.length > 0) {
             console.log("Columns:", Object.keys(data[0]));
             console.log("Sample:", data[0]);
        } else {
            console.log("Table empty, checking via insert/error approach?");
             // Probe expires_at
             const { error: probeError } = await supabase.from('client_packages').select('expires_at').limit(1);
             if (probeError) console.log("expires_at invalid:", probeError.message);
             else console.log("expires_at exists.");
        }
    }
}

inspect();
