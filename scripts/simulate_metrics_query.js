const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function simulateQuery() {
  const saleType = '02';
  // Use today's range
  const startDate = '2026-01-09';
  const endDate = '2026-01-09';
  
  // This simulates the baseFilterQuery logic
  console.log("Simulating Query with GLOBAL EXCLUSION != '02'...");
  
  const { data, error } = await supabase
    .from('sales')
    .select('id, sale_date, sale_items!inner(sale_type)') // !inner simulates the implicit inner join effect of filtering on child
    .gte('sale_date', '2026-01-09T03:00:00.000Z') // Approximate midnight BRT
    .lte('sale_date', '2026-01-10T02:59:59.000Z')
    .neq('sale_items.sale_type', '02'); // This is the filter

  if (error) {
    console.error("Error:", error);
    return;
  }
  
  console.log("Rows returned:", data?.length);
  if (data?.length === 0) {
    console.log("ZERO ROWS! Investigation:");
    // Check if distinct rows exist without the filter
    const { count } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true })
        .gte('sale_date', '2026-01-09T03:00:00.000Z');
    console.log("Total sales today (no filter):", count);
  } else {
    console.log("First 3 rows:", data.slice(0,3));
  }
}

simulateQuery();
