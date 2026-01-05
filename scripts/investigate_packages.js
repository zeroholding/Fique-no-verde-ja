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

async function investigate() {
    console.log("=== INVESTIGAÇÃO DE PACOTES ===\n");
    
    // 1. Contar client_packages
    const { count: pkgCount } = await supabase.from('client_packages').select('*', { count: 'exact', head: true });
    console.log(`client_packages: ${pkgCount} registros`);
    
    // 2. Contar package_consumptions
    const { count: consCount } = await supabase.from('package_consumptions').select('*', { count: 'exact', head: true });
    console.log(`package_consumptions: ${consCount} registros`);
    
    // 3. Verificar se há pacotes com saldo > 0
    const { data: pkgsWithBalance } = await supabase.from('client_packages').select('id, client_id, remaining_quantity').gt('remaining_quantity', 0).limit(10);
    console.log(`\nPacotes com saldo > 0: ${pkgsWithBalance?.length || 0}`);
    if (pkgsWithBalance?.length) {
        console.log("Amostra:", pkgsWithBalance.slice(0,3));
    }
    
    // 4. Verificar clientes tipo "package"
    const { count: pkgClients } = await supabase.from('clients').select('*', { count: 'exact', head: true }).eq('client_type', 'package');
    console.log(`\nClientes tipo 'package': ${pkgClients}`);
}

investigate();
