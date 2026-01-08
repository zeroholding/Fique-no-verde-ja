const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixMisclassified() {
  console.log("Iniciando correção de Vendas Tipo 03 (Consumo) erroneamente classificadas como Reclamação...");

  // 1. Verificar quantos existem
  const { data: items, error: countError } = await supabase
    .from('sale_items')
    .select('id, sale_id, product_name, sale_type')
    .eq('sale_type', '03')
    .ilike('product_name', '%Reclama%');

  if (countError) {
    console.error("Erro ao contar:", countError);
    return;
  }

  console.log(`Encontrados para correção: ${items.length} itens.`);

  if (items.length === 0) {
    console.log("Nada a corrigir.");
    return;
  }

  // 2. Atualizar para 'Atrasos'
  // Fazer em lote ou um update where
  const { data: updated, error: updateError } = await supabase
    .from('sale_items')
    .update({ product_name: 'Atrasos' })
    .eq('sale_type', '03')
    .ilike('product_name', '%Reclama%')
    .select();

  if (updateError) {
    console.error("Erro no update:", updateError);
  } else {
    console.log(`Sucesso! ${updated.length} itens atualizados de 'Reclamação' para 'Atrasos'.`);
  }
}

fixMisclassified();
