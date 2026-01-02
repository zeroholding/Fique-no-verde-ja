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

async function checkClientAndSale() {
  const clientName = 'BOX7 CLAYTON';
  console.log(`Checking for client: '${clientName}'...`);

  // 1. Check strict match
  let { data: clients, error } = await supabase
    .from('clients')
    .select('id, name')
    .ilike('name', `%${clientName}%`);

  if (error) {
    console.error("Error searching client:", error);
    return;
  }

  if (!clients || clients.length === 0) {
    console.log("Client NOT FOUND in database.");
  } else {
    console.log("Client matches found:", clients);
    
    // Check sales for these clients
    for (const client of clients) {
        const { data: sales } = await supabase.from('sales').select('id, total, created_at, sale_date').eq('client_id', client.id);
        console.log(`Sales for ${client.name} (${client.id}):`, sales?.length || 0);
        if (sales && sales.length > 0) {
            console.log(sales);
        }
    }
  }
}

checkClientAndSale();
