
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const packageIds = [
  '300d29b6-2e27-465d-be26-f7e2938543cb', // FASTFLEX
  '01ed08aa-532c-4390-9067-649f94fc9580', // M3
  'fbb3b9a3-d64d-4963-8526-51f3822882f8', // M3 secondary
  'f2b87d31-e24f-48e3-bd56-9a415705e4a5'  // LVM
];

async function repair() {
  console.log("Cleaning ghost balances for carriers...");
  
  for (const id of packageIds) {
    console.log(`Repairing package: ${id}`);
    
    // Reset counters and deactivate
    const { data, error } = await s
      .from('client_packages')
      .update({
        consumed_quantity: 0,
        available_quantity: s.rpc('exec_sql', { query: `SELECT initial_quantity FROM client_packages WHERE id = '${id}'` }), // Placeholder logic
        // Safer way: just update consumed to 0 and available to initial_quantity using a raw sql through rpc if needed, 
        // or just fetch first.
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
      
    // Actually, let's use exec_sql for precision
    const { error: sqlError } = await s.rpc('exec_sql', {
      query: `UPDATE client_packages 
              SET consumed_quantity = 0, 
                  available_quantity = initial_quantity,
                  is_active = false,
                  updated_at = NOW() 
              WHERE id = '${id}'`
    });
    
    if (sqlError) {
      console.error(`Error repairing ${id}:`, sqlError);
    } else {
      console.log(`Package ${id} cleaned and deactivated.`);
    }
  }
  
  console.log("Repair finished.");
}

repair();
