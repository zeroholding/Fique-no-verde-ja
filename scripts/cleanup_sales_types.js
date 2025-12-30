const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Manually load env vars
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

async function cleanupSales() {
  console.log("Starting cleanup of Type 02 and Type 03 sales...");

  // 1. Identify Sales IDs to delete (Sales containing items of Type 02 or 03)
  const findQuery = `
    SELECT DISTINCT sale_id 
    FROM sale_items 
    WHERE sale_type IN ('02', '03')
  `;
  
  const { data: salesToDelete, error: findError } = await supabase.rpc('exec_sql', { query: findQuery });
  
  if (findError) {
    console.error("Error finding sales:", findError);
    return;
  }

  const ids = salesToDelete.map(s => s.sale_id);
  
  if (ids.length === 0) {
    console.log("No Type 02 or Type 03 sales found to delete.");
    return;
  }

  console.log(`Found ${ids.length} sales to delete.`);
  const idsString = ids.map(id => `'${id}'`).join(',');
  
  // 2. Delete dependencies in order
  
  // A. Package Consumptions (linked to packages which are linked to sales, OR linked directly to sales if structure permits)
  // We need to find package IDs linked to these sales first if we want to be thorough, 
  // but often consumptions are on packages created by sales.
  // HOWEVER, Type 03 IS consumption. Type 02 IS package creation.
  
  // A-0. Package Consumptions (orphan check)
  console.log("Deleting linked Package Consumptions...");
  // Try to delete consumptions linked to packages that are linked to these sales
   const pkgQuery = `SELECT id FROM client_packages WHERE sale_id IN (${idsString})`;
   const pkgRes = await supabase.rpc('exec_sql', { query: pkgQuery });
   if (pkgRes.data && pkgRes.data.length > 0) {
      const pkgIds = pkgRes.data.map(p => `'${p.id}'`).join(',');
      await supabase.rpc('exec_sql', { 
        query: `DELETE FROM client_package_consumptions WHERE client_package_id IN (${pkgIds})` 
      });
   }

  // A. Client Packages
  console.log("Deleting linked Client Packages...");
  await supabase.rpc('exec_sql', { 
    query: `DELETE FROM client_packages WHERE sale_id IN (${idsString})` 
  });

  // A-1. Commissions (linked to sale items OR sales)
  console.log("Deleting linked Commissions...");
  // Commissions are usually linked to sale_id or sale_item_id.
  // Checking schema or assuming link to sale_id is safest first, 
  // but error said 'commissions_sale_item_id_fkey', so we need to find items first.
  
  // Get all item IDs to delete
  const itemsQuery = `SELECT id FROM sale_items WHERE sale_id IN (${idsString})`;
  const itemsRes = await supabase.rpc('exec_sql', { query: itemsQuery });
  
  if (itemsRes.data && itemsRes.data.length > 0) {
      const itemIds = itemsRes.data.map(i => `'${i.id}'`).join(',');
      await supabase.rpc('exec_sql', { 
        query: `DELETE FROM commissions WHERE sale_item_id IN (${itemIds})` 
      });
      // Also check for commissions linked directly to sale_id if column exists
      // based on typical schemas, but let's stick to the error message fix first.
  }

  // B. Sale Items
  console.log("Deleting ALL Sale Items for target sales...");
  const itemsDelete = await supabase.rpc('exec_sql', { 
    query: `DELETE FROM sale_items WHERE sale_id IN (${idsString})` 
  });
  if (itemsDelete.error) {
      console.error("Error deleting items:", itemsDelete.error);
      return; // Stop here if items aren't deleted
  }

  // C. Sales
  console.log("Deleting Sales...");
  const deleteRes = await supabase.rpc('exec_sql', { 
    query: `DELETE FROM sales WHERE id IN (${idsString})` 
  });

  if (deleteRes.error) {
    console.error("Error deleting sales:", deleteRes.error);
  } else {
    console.log("✅ Cleanup successful.");
  }

  // Verification
  console.log("\n--- Verification: Remaining Sales Types ---");
  const countQuery = `
    SELECT sale_type, COUNT(*) 
    FROM sale_items 
    GROUP BY sale_type
  `;
  const countRes = await supabase.rpc('exec_sql', { query: countQuery });
  console.table(countRes.data || []);
}

cleanupSales();
