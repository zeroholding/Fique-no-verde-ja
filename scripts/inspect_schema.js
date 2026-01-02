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

async function inspect() {
  console.log("Checking Services...");
  const { data: services } = await supabase.from('services').select('*').limit(1);
  if (services && services.length > 0) {
      console.log("Service Columns:", Object.keys(services[0]));
      console.log("Sample Service:", services[0]);
  } else {
      console.log("No services found.");
  }

  console.log("\nChecking Users...");
  const { data: users } = await supabase.from('users').select('*').limit(1);
  if (users && users.length > 0) {
      console.log("User Columns:", Object.keys(users[0]));
      console.log("Sample User:", users[0]);
  }

  console.log("\nChecking Sale Items...");
  const { data: items } = await supabase.from('sale_items').select('*').limit(1);
  if (items && items.length > 0) {
      console.log("Items Columns:", Object.keys(items[0]));
  } else {
      console.log("No items found."); 
  }

  console.log("\nChecking Commissions Table...");
  const { data: comms, error } = await supabase.from('commissions').select('*').limit(1);
  if (error) console.log("Error checking commissions:", error.message);
  else if (comms && comms.length > 0) {
       console.log("Commission Columns:", Object.keys(comms[0]));
  } else {
       console.log("Commissions table empty or columns unknown.");
       // Insert dummy to check columns? No, safer to just guess or check metadata if possible.
       // Try to select common columns to see if they error.
       const { error: err2 } = await supabase.from('commissions').select('sale_id, amount, status, user_id').limit(1);
       if (!err2) console.log("Confirmed columns: sale_id, amount, status, user_id");
  }
}

inspect();
