
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  console.log("Simulating a NEW sale (Today) via the backend logic...");
  
  const requestedSaleDate = "2025-12-22"; // Representing the frontend's today string
  
  // Logic from the backend
  let finalSaleDate = new Date();
  if (requestedSaleDate) {
      const [y, m, d] = requestedSaleDate.split("-").map(Number);
      finalSaleDate.setFullYear(y, m - 1, d);
  }
  
  console.log("Final Date to be saved:", finalSaleDate.toISOString());
  
  // Actually insert to test
  const { data, error } = await s.from('sales').insert({
    client_id: '30b5b0ce-eb4a-4c11-b932-57159a7098b3',
    attendant_id: '42b6c7ba-bef7-4dc2-b1eb-45170f2bb8e7',
    sale_date: finalSaleDate,
    observations: 'TESTE TIME PRESERVATION',
    status: 'aberta'
  }).select();
  
  if (error) console.error(error);
  else console.log("Sale created successfully with date:", data[0].sale_date);
}

test();
