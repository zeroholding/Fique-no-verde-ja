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

async function checkPackageAttendants() {
  console.log("Checking attendants for packages...\n");

  const { data: packages } = await supabase.from('client_packages').select('*');
  const { data: users } = await supabase.from('users').select('id, first_name, last_name');
  const { data: clients } = await supabase.from('clients').select('id, name');
  
  const userMap = {};
  users.forEach(u => userMap[u.id] = `${u.first_name} ${u.last_name}`);
  const clientMap = {};
  clients.forEach(c => clientMap[c.id] = c.name);

  // Get sales for these packages
  const saleIds = packages.map(p => p.sale_id).filter(Boolean);
  const { data: sales } = await supabase.from('sales').select('id, attendant_id').in('id', saleIds);
  const saleMap = {};
  sales.forEach(s => saleMap[s.id] = s.attendant_id);

  console.log("Packages and Attendants:\n");
  console.log("Cliente | Total Pago | Atendente");
  console.log("--------|------------|----------");

  packages.forEach(pkg => {
      const clientName = clientMap[pkg.client_id] || 'Unknown';
      const saleAttendantId = saleMap[pkg.sale_id];
      const attendantName = userMap[saleAttendantId] || 'N/A';
      console.log(`${clientName} | R$ ${pkg.total_paid} | ${attendantName}`);
  });
}

checkPackageAttendants();
