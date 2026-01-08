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

async function getSaleDetails() {
  const saleId = '8bacc0ac-7fcd-4dd8-b297-87f450268d92';
  console.log(`Fetching details for sale: ${saleId}...`);
  
  const { data: sale, error } = await supabase
    .from('sales')
    .select(`
      *,
      clients (name, email, phone),
      users:attendant_id (first_name, last_name, email),
      sale_items (
        product_name,
        quantity,
        unit_price,
        subtotal,
        discount_value,
        total,
        sale_type
      )
    `)
    .eq('id', saleId)
    .single();

  if (error) {
    console.error("Error fetching sale:", error.message);
    return;
  }

  // Time conversion
  const date = new Date(sale.sale_date);
  const localTime = date.getTime() - (3 * 60 * 60 * 1000); 
  const localDate = new Date(localTime);

  console.log('\n================ SALE DETAILS ================');
  console.log(`ID: ${sale.id}`);
  console.log(`Date (BRT): ${localDate.toLocaleString('pt-BR')}`);
  console.log(`Status: ${sale.status}`);
  console.log('----------------------------------------------');
  console.log(`Client: ${sale.clients?.name || 'N/A'} (${sale.clients?.email || ''})`);
  console.log(`Attendant: ${sale.users?.first_name} ${sale.users?.last_name}`);
  console.log('----------------------------------------------');
  console.log('ITEMS:');
  sale.sale_items.forEach((item, index) => {
      console.log(`#${index+1} ${item.product_name}`);
      console.log(`    Qtd: ${item.quantity} | Unit: ${formatMoney(item.unit_price)}`);
      console.log(`    Subtotal: ${formatMoney(item.subtotal)}`);
      console.log(`    Discount: -${formatMoney(item.discount_value)}`);
      console.log(`    Total: ${formatMoney(item.total)}`);
      console.log(`    Type: ${item.sale_type === '03' ? 'Pacote' : 'Venda Comum'}`);
  });
  console.log('----------------------------------------------');
  console.log(`TOTAL DISCOUNT: -${formatMoney(sale.total_discount)}`);
  console.log(`TOTAL GROSS (Items Total): ${formatMoney(sale.total)}`);
  console.log('==============================================');
}

function formatMoney(val) {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

getSaleDetails();
