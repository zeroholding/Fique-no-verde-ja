const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAttendants() {
  const start = '2026-01-09T00:00:00.000Z'; // UTC (approx start of today BRT)
  
  const { data: sales, error } = await supabase
    .from('sales')
    .select(`
      id, 
      sale_date, 
      total,
      attendant_id,
      users ( first_name, last_name, email ),
      sale_items ( sale_type, subtotal )
    `)
    .gte('sale_date', '2026-01-08T21:00:00.000Z') // Coverage
    .order('sale_date', { ascending: false });

  if (error) console.error(error);
  
  if (sales) {
    sales.forEach(s => {
      const items = s.sale_items || [];
      const types = items.map(i => i.sale_type).join(', ');
      const user = s.users ? `${s.users.first_name} ${s.users.email}` : 'Unknown';
      console.log(`Sale ${s.id.slice(0,8)} | Date: ${s.sale_date} | Total: ${s.total} | Types: [${types}] | Attendant: ${s.attendant_id} (${user})`);
    });
  }
}

checkAttendants();
