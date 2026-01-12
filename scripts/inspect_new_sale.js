const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectSaleAndPackage() {
  const saleId = '38171d06-292c-4fa5-acb8-c5d9927427ae';
  console.log(`=== INSPECIONANDO VENDA: ${saleId} ===\n`);

  // 1. Check Sale Details
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .select(`
      *,
      sale_items (*)
    `)
    .eq('id', saleId)
    .single();

  if (saleError) {
    console.error("Erro ao buscar venda:", saleError);
    return;
  }

  console.log(`Status: ${sale.status}`);
  console.log(`Data: ${sale.sale_date}`);
  console.log(`Total: ${sale.total}`);
  
  // Check items to infer intended type if useful
  console.log(`Itens:`, sale.sale_items.length);
  sale.sale_items.forEach(i => {
    console.log(`  - Produto: ${i.product_name}, Tipo: ${i.sale_type}`);
  });

  // 2. Check Client Packages linked to this sale
  const { data: pkg, error: pkgError } = await supabase
    .from('client_packages')
    .select('*')
    .eq('sale_id', saleId);

  if (pkgError) {
    console.error("Erro ao buscar client_packages:", pkgError);
  } else {
    console.log(`\nRegistros em client_packages: ${pkg.length}`);
    pkg.forEach(p => {
      console.log(`  - ID: ${p.id}, Qtd: ${p.initial_quantity}, Pago: ${p.total_paid}`);
    });
  }

  if (pkg.length === 0) {
    console.log("\n❌ PROBLEMA: Nenhum registro de pacote foi criado para esta venda.");
    console.log("Isso explica porque não aparece no extrato.");
  }
}

inspectSaleAndPackage();
