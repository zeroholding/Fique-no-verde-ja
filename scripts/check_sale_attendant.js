const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSaleAttendant() {
  const saleId = '38171d06-292c-4fa5-acb8-c5d9927427ae';
  console.log(`=== CHECANDO ATTENDANT DA VENDA ${saleId} ===\n`);

  const { data: sale } = await supabase
    .from('sales')
    .select('id, attendant_id')
    .eq('id', saleId)
    .single();

  if (!sale) return console.error("Venda nao encontrada");

  console.log(`Attendant ID: ${sale.attendant_id}`);
  
  if (!sale.attendant_id) {
    console.log("⚠️ ALERTA: attendant_id é NULO! Isso quebra o INNER JOIN no extrato.");
  }
}

checkSaleAttendant();
