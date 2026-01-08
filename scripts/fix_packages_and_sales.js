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

// IDs
const OLD_SERVICE_ID = '7618e745-490d-4264-b349-7827ef07e3ae'; // Reclamação
const NEW_SERVICE_ID = '42b1d178-1f56-46ef-8048-ecfbdfc02582'; // Atrasos
const THALITA_ID = '42b6c7ba-bef7-4dc2-b1eb-45170f2bb8e7';
const GIANLUCCA_ID = '51cbe1f7-0c68-47e0-a565-1ad4aa09f680';

async function fixPackagesAndSales() {
  console.log("Starting corrections...\n");

  // 1. Get all packages with the old service
  const { data: packages, error: pkgErr } = await supabase
    .from('client_packages')
    .select('id, sale_id')
    .eq('service_id', OLD_SERVICE_ID);

  if (pkgErr) {
    console.error("Error fetching packages:", pkgErr.message);
    return;
  }

  console.log(`Found ${packages.length} packages to update.\n`);

  // 2. Update service_id on client_packages
  console.log("Step 1: Updating service_id on client_packages...");
  const { error: updatePkgErr } = await supabase
    .from('client_packages')
    .update({ service_id: NEW_SERVICE_ID })
    .eq('service_id', OLD_SERVICE_ID);

  if (updatePkgErr) {
    console.error("Error updating packages:", updatePkgErr.message);
  } else {
    console.log(`✅ Updated ${packages.length} packages: service_id → Atrasos\n`);
  }

  // 3. Get sale IDs from these packages
  const saleIds = packages.map(p => p.sale_id).filter(Boolean);
  console.log(`Step 2: Updating attendant_id on ${saleIds.length} sales...`);

  // 4. Update attendant_id on sales (only those from THALITA)
  const { error: updateSaleErr } = await supabase
    .from('sales')
    .update({ attendant_id: GIANLUCCA_ID })
    .in('id', saleIds)
    .eq('attendant_id', THALITA_ID);

  if (updateSaleErr) {
    console.error("Error updating sales:", updateSaleErr.message);
  } else {
    console.log(`✅ Updated sales: attendant_id → GIANLUCCA\n`);
  }

  // 5. Also update product_name on sale_items for these sales
  console.log("Step 3: Updating product_name on sale_items...");
  const { error: updateItemsErr } = await supabase
    .from('sale_items')
    .update({ product_name: 'Atrasos' })
    .in('sale_id', saleIds)
    .ilike('product_name', '%reclam%');

  if (updateItemsErr) {
    console.error("Error updating items:", updateItemsErr.message);
  } else {
    console.log(`✅ Updated sale_items: product_name → Atrasos\n`);
  }

  console.log("=== CORRECTIONS COMPLETE ===");
}

fixPackagesAndSales();
