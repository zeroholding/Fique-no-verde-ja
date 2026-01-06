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
    console.log("=== INSPECTING COMMISSION POLICIES ===\n");
    
    const { data, error } = await supabase.from('commission_policies').select('*').limit(20);
    
    if (error) {
        console.error("Error:", error.message);
    } else {
        console.log("Found policies:", data?.length);
        if (data?.length) {
            data.forEach(p => {
                console.log(`Name: ${p.name} | Applies: ${p.applies_to} | Value: ${p.value} | Start: ${p.valid_from} | End: ${p.valid_until}`);
            });
        }
    }
}

inspect();
