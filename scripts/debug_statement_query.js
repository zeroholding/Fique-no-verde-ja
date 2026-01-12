const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function debugStatement() {
  console.log("=== DEBUG SQL EXTRATO DE PACOTES ===\n");

  const { data: clients } = await supabase.from('clients').select('id').ilike('name', '%J3%').limit(1);
  const clientId = clients[0].id;
  
  const sql = `
    SELECT
      cp.id,
      cp.client_id,
      c.name AS client_name,
      cp.sale_id,
      s.attendant_id,
      u.first_name || ' ' || u.last_name AS attendant_name,
      COALESCE(s.sale_date, cp.created_at) AS op_date,
      cp.total_paid AS value,
      cp.initial_quantity AS quantity,
      s.status
    FROM client_packages cp
    JOIN clients c ON cp.client_id = c.id
    JOIN sales s ON cp.sale_id = s.id
    JOIN users u ON s.attendant_id = u.id
    WHERE cp.client_id = '${clientId}'
  `; // Removed LEFT JOIN serv for simplicity, added WHERE client
  
  // Running via rpc to execute raw or simulating with api/db query method if possible
  // Since I can't run raw SQL easily without the `query` helper which I can't import in script easily (it uses process.env inside module),
  // I will use `supabase` client with joins if possible, OR just check the tables individually again.
  
  // Let's check `client_packages` specifically for J3 and see the sale_id
  const { data: pkgs, error } = await supabase
    .from('client_packages')
    .select(`
      id, 
      initial_quantity, 
      sale_id,
      sales!inner (
        id, 
        status, 
        attendant_id,
        users!inner (
           first_name
        )
      )
    `)
    .eq('client_id', clientId);
    
  if (error) {
      console.error(error);
      return;
  }
  
  console.log(`Encontrados ${pkgs.length} pacotes para J3.`);
  
  pkgs.forEach(p => {
      console.log(`Pkg ID: ${p.id}`);
      console.log(`Qtd: ${p.initial_quantity}`);
      console.log(`Sale ID: ${p.sale_id}`);
      console.log(`Sale Found: ${!!p.sales}`);
      if (p.sales) {
          console.log(`  Status: ${p.sales.status}`);
          console.log(`  Attendant: ${p.sales.attendant_id}`);
          console.log(`  User: ${p.sales.users?.first_name}`);
      }
      console.log('---');
  });
}

debugStatement();
