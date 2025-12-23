const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function simulateLogic() {
  const finalSaleDate = new Date();
  console.log('1. JS Date object:', finalSaleDate.toISOString());

  // Simular query de lib/db.ts
  const sqlInsertSale = `
    INSERT INTO sales (client_id, attendant_id, sale_date, status)
    VALUES ('0b788c39-c305-4bd9-a823-951032d2733c', '51cbe1f7-0c68-47e0-a565-1ad4aa09f680', '${finalSaleDate.toISOString()}', 'confirmada')
    RETURNING id, sale_date;
  `;

  const { data: saleRes, error: saleErr } = await supabase.rpc('exec_sql', { query: sqlInsertSale });
  if (saleErr) return console.error('Sale Insert Err:', saleErr);
  console.log('saleRes raw:', saleRes);

  if (!saleRes || saleRes.length === 0) {
      console.error('No data returned from sale insert');
      return;
  }
  const saleDate = saleRes[0].sale_date;
  console.log('2. Returned from DB (saleDate):', saleDate, 'Type:', typeof saleDate);

  const sqlInsertComm = `
    INSERT INTO commissions (sale_id, sale_item_id, user_id, base_amount, reference_date, status)
    VALUES ('${saleRes[0].id}', '661e65ba-c952-4c76-90ad-b074a5451aab', '51cbe1f7-0c68-47e0-a565-1ad4aa09f680', 100, '${saleDate}', 'a_pagar')
    RETURNING reference_date;
  `;

  const { data: commRes, error: commErr } = await supabase.rpc('exec_sql', { query: sqlInsertComm });
  if (commErr) return console.error('Comm Insert Err:', commErr);

  console.log('3. Stored in Commission:', commRes[0].reference_date);
}

simulateLogic();
