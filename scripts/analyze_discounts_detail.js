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

async function analyzeDiscountDetails() {
  console.log("Fetching Discount Details for 2026-01-05...");
  
  const startUTC = '2026-01-05T03:00:00.000Z';
  const endUTC = '2026-01-06T03:00:00.000Z';
  
  // Fetch sales with discounts > 0
  const { data: sales, error } = await supabase
    .from('sales')
    .select(`
      id,
      sale_date,
      total_discount,
      attendant_id,
      users:attendant_id (
        first_name,
        last_name,
        email
      ),
      sale_items (
        sale_type,
        product_name,
        quantity
      )
    `)
    .neq('status', 'cancelada')
    .gt('total_discount', 0)
    .gte('sale_date', startUTC)
    .lt('sale_date', endUTC);

  if (error) {
    console.error("Error fetching sales:", error.message);
    return;
  }

  if (!sales || sales.length === 0) {
      console.log("No sales with discounts found for this period.");
      return;
  }

  console.log(`Found ${sales.length} discounted sales.\n`);

  sales.forEach(sale => {
      const attendantName = sale.users 
          ? `${sale.users.first_name || ''} ${sale.users.last_name || ''}`.trim() || sale.users.email
          : 'Unknown Attendant';
      
      // Determine Sale Type (Mixed vs Specific)
      const types = [...new Set(sale.sale_items.map(i => i.sale_type))];
      const itemsDesc = sale.sale_items.map(i => `${i.product_name} (${i.quantity})`).join(', ');
      
      let typeLabel = types.join(', ');
      if (types.includes('03')) typeLabel += ' (Pacote)';
      else if (types.includes('common')) typeLabel += ' (Venda Comum)';
      
      console.log(`ID: ${sale.id}`);
      console.log(`   Attendant: ${attendantName}`);
      console.log(`   Discount: -${sale.total_discount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
      console.log(`   Type(s): ${typeLabel}`);
      console.log(`   Items: ${itemsDesc}`);
      console.log('--------------------------------------------------');
  });
}

analyzeDiscountDetails();
