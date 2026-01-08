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

async function showPackageValues() {
  console.log("Checking client_packages values...\n");

  // Fetch all columns
  const { data: packages, error } = await supabase
    .from('client_packages')
    .select('*');

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  // Fetch clients
  const { data: clients } = await supabase.from('clients').select('id, name');
  const clientMap = {};
  clients.forEach(c => clientMap[c.id] = c.name);

  console.log("Package Details:\n");
  packages.forEach(pkg => {
    const clientName = clientMap[pkg.client_id] || 'Unknown';
    console.log(`ID: ${pkg.id}`);
    console.log(`  Cliente: ${clientName}`);
    console.log(`  Quantidade: ${pkg.quantity}`);
    console.log(`  Unit Price: ${pkg.unit_price}`);
    console.log(`  Total Value: R$ ${(pkg.quantity || 0) * (pkg.unit_price || 0)}`);
    console.log(`  Consumido: ${pkg.consumed_quantity || 0}`);
    console.log(`  Created: ${pkg.created_at}`);
    console.log(`  All Fields:`, JSON.stringify(pkg, null, 2));
    console.log("---");
  });
}

showPackageValues();
