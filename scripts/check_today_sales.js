const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTodaySales() {
  const start = '2026-01-09T00:00:00.000Z'; // UTC Start of today (or late yesterday in BRT)
  const end = '2026-01-09T23:59:59.999Z';   // UTC End of today
  
  // Note: We'll fetch a wider range just to be sure we catch BRT times
  const searchStart = '2026-01-08T21:00:00.000Z'; // 2026-01-09 00:00 BRT
  
  const { data: sales, error } = await supabase
    .from('sales')
    .select(`
      id, 
      sale_date, 
      total,
      sale_items ( sale_type, product_name, total )
    `)
    .gte('sale_date', searchStart)
    .order('sale_date', { ascending: false });

  if (error) console.error(error);
  
  console.log(`Sales found since ${searchStart}:`, sales?.length);
  
  if (sales) {
    sales.forEach(s => {
      const items = s.sale_items || [];
      const types = items.map(i => i.sale_type).join(', ');
      console.log(`Sale ${s.id.slice(0,8)} | Date: ${s.sale_date} | Total: ${s.total} | Types: [${types}]`);
    });
  }
}

checkTodaySales();
