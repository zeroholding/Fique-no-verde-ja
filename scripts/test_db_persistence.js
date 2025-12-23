const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testType() {
  const testTime = '2025-12-23T15:00:00.000Z';
  console.log('Tentando salvar:', testTime);

  const { data, error } = await supabase
    .from('commissions')
    .update({ reference_date: testTime })
    .eq('sale_id', 'e72efa73-f053-4aa8-acae-40ce2b48b1a5') // Venda #141
    .select('reference_date');

  if (error) {
    console.error('Error during update:', error);
  } else {
    console.log('Resultado do banco:', JSON.stringify(data, null, 2));
    if (data && data[0].reference_date.includes('15:00')) {
      console.log('CONFIRMADO: É TIMESTAMPTZ');
    } else {
      console.log('CONFIRMADO: É DATE (truncou o horário)');
    }
  }
}

testType();
