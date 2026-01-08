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

async function investigateClientPackages() {
  console.log("Investigating client_packages table...\n");

  // Fetch all client packages
  const { data: packages, error } = await supabase
    .from('client_packages')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  console.log(`Found ${packages.length} packages.\n`);

  // Fetch clients
  const { data: clients } = await supabase.from('clients').select('id, name');
  const clientMap = {};
  clients.forEach(c => clientMap[c.id] = c.name);

  // Fetch services
  const { data: services } = await supabase.from('services').select('id, name');
  const serviceMap = {};
  services.forEach(s => serviceMap[s.id] = s.name);

  console.log("All packages:\n");
  console.log("ID (short) | Client | Service | Qty | Consumed | Remaining | Created");
  console.log("-----------|--------|---------|-----|----------|-----------|--------");

  packages.forEach(pkg => {
    const clientName = clientMap[pkg.client_id] || 'Unknown';
    const serviceName = serviceMap[pkg.service_id] || 'Unknown';
    const remaining = pkg.quantity - (pkg.consumed_quantity || 0);
    console.log(`${pkg.id.slice(0,8)}... | ${clientName.slice(0,20)} | ${serviceName} | ${pkg.quantity} | ${pkg.consumed_quantity || 0} | ${remaining} | ${new Date(pkg.created_at).toLocaleDateString('pt-BR')}`);
  });

  // Find packages that might have "Reclamação" service but should be "Atrasos"
  console.log("\n--- SERVICE CHECK ---");
  packages.forEach(pkg => {
    const serviceName = serviceMap[pkg.service_id] || 'Unknown';
    if (serviceName.toLowerCase().includes('reclam')) {
        console.log(`Package ${pkg.id} has service "Reclamação" (ID: ${pkg.service_id})`);
    }
  });

  console.log("\n--- SERVICE IDs ---");
  console.log("Available services:");
  services.forEach(s => console.log(`  ${s.id}: ${s.name}`));
}

investigateClientPackages();
