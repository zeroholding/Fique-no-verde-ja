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

async function debug() {
    console.log("=== DEBUG PACOTES ===\n");
    
    // 1. Ver dados brutos inseridos
    const { data: packages, error } = await supabase
        .from('client_packages')
        .select('*')
        .limit(5);
    
    if (error) {
        console.error("Erro:", error);
        return;
    }
    
    console.log("Pacotes encontrados:", packages?.length);
    if (packages?.length) {
        console.log("\nAmostra de 1 registro:");
        console.log(JSON.stringify(packages[0], null, 2));
    }
    
    // 2. Verificar se o JOIN com services funciona
    const { data: joined, error: joinErr } = await supabase
        .from('client_packages')
        .select(`
            id,
            client_id,
            service_id,
            available_quantity,
            is_active,
            clients (name),
            services (name)
        `)
        .limit(3);
    
    if (joinErr) {
        console.error("\nErro no JOIN:", joinErr.message);
    } else {
        console.log("\nJOIN resultado:", joined);
    }
}

debug();
