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

async function testBehavior() {
  console.log("Testing DB Insert/Update behavior...");

  // 1. Create Sale
  const saleId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; // Mock ID or let DB generate? DB generate safer.
  
  // Need valid FKs.
  // We need a client.
  const { data: clients } = await supabase.from('clients').select('id').limit(1);
  const clientId = clients[0].id;
  
  // Need attendant.
  const { data: users } = await supabase.from('users').select('id').limit(1);
  const attendantId = users[0].id;
  
  console.log("Step 1: Insert Sale (Open)");
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert({
      client_id: clientId,
      attendant_id: attendantId,
      sale_date: new Date().toISOString(),
      status: 'confirmada',
      payment_method: 'pix',
      general_discount_value: 0
    })
    .select()
    .single();

  if (saleError) {
    console.error("Sale Insert Error:", saleError);
    return;
  }
  const id = sale.id;
  console.log(`Sale Created: ${id}. Discount: ${sale.total_discount} (Should be 0 or null)`);

  // 2. Insert Item
  // 10 items, 30 unit price. Discount 20 FIXED ? NO, API does item calculation first.
  // API: subtotal = 300. discountAmount = 20. itemTotal = 280.
  console.log("Step 2: Insert Sale Item (10 items, 20 discount fixed)");
  // Discount fixed on the item row?
  // Frontend: discountValue: 20.
  // Backend calc: discountAmount = 20.
  // Insert: discount_value: 20, discount_amount: 20.
  
  const { error: itemError } = await supabase
    .from('sale_items')
    .insert({
       sale_id: id,
       product_name: "Test Product",
       quantity: 10,
       unit_price: 30,
       subtotal: 300,
       discount_type: 'fixed',
       discount_value: 20,    // The "200" suspect?
       discount_amount: 20,   // Calculated amount
       total: 280,
       sale_type: '01'
    });

  if (itemError) {
    console.error("Item Insert Error:", itemError);
  } else {
    console.log("Item Inserted.");
  }

  // 3. Update Sale
  // API Logic updates sales table with aggregated values.
  // totalSubtotal = 300.
  // totalDiscountGiven = 20 (sum of item discounts).
  // finalTotal = 280.
  
  console.log("Step 3: Update Sale Totals (Simulating API logic)");
  const { error: updateError } = await supabase
    .from('sales')
    .update({
        subtotal: 300,
        total_discount: 20,       // We send 20 here!
        total: 280,
        discount_amount: 20,
        commission_amount: 0
    })
    .eq('id', id);

  if (updateError) {
    console.error("Update Error:", updateError);
  } else {
    console.log("Sale Updated.");
  }

  // 4. Verify Final State
  const { data: finalSale } = await supabase
    .from('sales')
    .select('subtotal, total_discount, total')
    .eq('id', id)
    .single();

  console.log("Final State:", finalSale);
  
  // Cleanup
  await supabase.from('sale_items').delete().eq('sale_id', id);
  await supabase.from('sales').delete().eq('id', id);
}

testBehavior();
