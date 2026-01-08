const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Erro: Variáveis de ambiente ausentes.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkMisclassified() {
  console.log("Verificando vendas Tipo 03 (Consumo) classificadas como 'Reclamação'...");

  // Buscar itens de venda que são Tipo 03 E nome do produto contém 'Reclama'
  const { data: items, error } = await supabase
    .from('sale_items')
    .select(`
      id,
      product_name,
      sale_id,
      sales (
        id,
        sale_date
      )
    `)
    .ilike('product_name', '%Reclama%');

  if (error) {
    console.error("Erro ao buscar itens:", error);
    return;
  }

  // Fetch sale types manually to avoid join complexity/schema cache issues
  const saleIds = items.map(i => i.sale_id);
  const { data: salesData } = await supabase
    .from('sales')
    .select('id, sale_type')
    .in('id', saleIds);
  
  const salesMap = new Map();
  salesData?.forEach(s => salesMap.set(s.id, s.sale_type));

  // Filtrar apenas os que são Tipo 03 (Consumo)
  const misclassified = items.filter(item => salesMap.get(item.sale_id) === '03');

  console.log(`\nEncontrados: ${misclassified.length} registros incorretos.\n`);

  if (misclassified.length > 0) {
    console.log("Exemplos (Primeiros 5):");
    misclassified.slice(0, 5).forEach((item, index) => {
      console.log(`${index + 1}. Venda ID: ${item.sale_id} | Cliente: ${item.sales.client_name} | Data: ${item.sales.sale_date} | Produto: ${item.product_name}`);
    });
  } else {
    console.log("Nenhum registro incorreto encontrado! Parece que já está limpo.");
  }
}

checkMisclassified();
