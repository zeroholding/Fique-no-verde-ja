const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function reproduceApiQuery() {
  console.log("=== REPRODUÇÃO EXATA DA QUERY DA API ===\n");
  
  // Parâmetros simulados do usuário (Admin, Todos os atendentes, Dia 09/01/2026)
  const startDate = '2026-01-09';
  const endDate = '2026-01-09';
  const adminAttendantId = null; // Todos
  const dayType = null;
  const saleType = null;
  const user = { id: '51cbe1f7-0c68-47e0-a565-1ad4aa09f680', is_admin: true };
  
  // Lógica do buildFilters (simplificada para o caso específico)
  const clauses = [];
  const params = [];
  let paramIdx = 1;
  
  // includePeriod logic
  clauses.push(`(s.sale_date AT TIME ZONE 'America/Sao_Paulo')::date >= $${paramIdx++}::date`);
  params.push(startDate);
  clauses.push(`(s.sale_date AT TIME ZONE 'America/Sao_Paulo')::date <= $${paramIdx++}::date`);
  params.push(endDate);
  
  const whereClause = clauses.join(' AND ');
  
  const querySql = `
    SELECT COUNT(DISTINCT s.id)::int AS count
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id
    LEFT JOIN services serv ON si.product_id = serv.id
    WHERE s.status != 'cancelada'
      AND (si.sale_type IS NULL OR si.sale_type != '02') -- Exclude Package Sales (Type 02)
      AND ${whereClause}
  `;
  
  console.log("SQL Gerado:");
  console.log(querySql);
  console.log("Parâmetros:", params);
  
  const { data, error } = await supabase.rpc('query_exec', {
    query_text: querySql,
    query_params: params
  });
  
  // Fallback se rpc query_exec não existir (usando uma query raw simulada via select se possível ou apenas imprimindo o que seria executado)
  // Como não temos acesso direto ao `query` function do lib/db.ts aqui, vamos tentar usar o client padrão para verificar se o dado existe com essas condições
  
  console.log("\n--- TESTE VIA SUPABASE CLIENT (Simulando a lógica) ---");
  
  // Simulando a lógica de data + timezone via Range
  // '2026-01-09' BRT é 2026-01-09 03:00 UTC até 2026-01-10 02:59 UTC
  
  const { count, error: err } = await supabase
    .from('sales')
    .select('id, sale_items!inner(sale_type)', { count: 'exact', head: true })
    .neq('status', 'cancelada')
    //.neq('sale_items.sale_type', '02') // Isso é INNER JOIN implicito
    .filter('sale_date', 'gte', '2026-01-09T03:00:00Z')
    .filter('sale_date', 'lte', '2026-01-10T02:59:59Z');

  // Vamos testar uma query raw via RPC se disponível, ou tentar entender o que o timezone faz
  
  console.log("\nVerificando Timezone do Banco:");
  const { data: tzCheck } = await supabase.rpc('get_current_timestamp_br'); // Imagining this might exist, if not we skip
  
  // Vamos buscar uma venda específica desse dia e ver como o banco enxerga a data dela com AT TIME ZONE
  const { data: sampleSale } = await supabase
    .from('sales')
    .select('id, sale_date')
    .gte('sale_date', '2026-01-09T03:00:00Z')
    .limit(1);
    
  if (sampleSale && sampleSale.length > 0) {
     console.log(`\nVenda Exemplo: ${sampleSale[0].id}`);
     console.log(`UTC Date: ${sampleSale[0].sale_date}`);
     
     // Tentar ver como isso ficaria em BRT
     // Isso requer query raw que não consigo fazer facilmente daqui sem a lib 'pg' direta ou RPC
     // Mas posso inferir.
  }
}

reproduceApiQuery();
