const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixMissingPackage() {
  const saleId = '38171d06-292c-4fa5-acb8-c5d9927427ae';
  console.log(`=== FIX: RECRIANDO PACOTE PARA VENDA ${saleId} ===\n`);

  // 1. Fetch Sale and Items
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .select(`*, sale_items (*)`)
    .eq('id', saleId)
    .single();

  if (saleError || !sale) return console.error("Venda nao encontrada", saleError);

  const item = sale.sale_items[0];
  if (!item) return console.error("Venda sem itens");

  const carrierId = sale.client_id;
  let serviceId = item.product_id;
  
  if (!serviceId) {
      console.log("Service ID (product_id) é nulo. Buscando serviço 'Atrasos'...");
      const { data: servs } = await supabase.from('services').select('id').ilike('name', '%Atrasos%').limit(1);
      if (servs && servs.length > 0) {
          serviceId = servs[0].id;
          console.log(`Service ID encontrado: ${serviceId}`);
      } else {
          return console.error("Serviço 'Atrasos' não encontrado no banco.");
      }
  }

  const totalQuantity = parseInt(item.quantity);
  const totalPaid = parseFloat(sale.total);
  const unitPricePackage = totalPaid / totalQuantity;

  console.log(`Carrier: ${carrierId}`);
  console.log(`Service: ${serviceId}`);
  console.log(`Qtd: ${totalQuantity}`);
  console.log(`Total: ${totalPaid}`);

  // 2. Check for existing active wallet (Replicating API Logic)
  const { data: existingWallets } = await supabase
    .from('client_packages')
    .select('*')
    .eq('client_id', carrierId)
    .eq('service_id', serviceId)
    .eq('is_active', true);

  if (existingWallets && existingWallets.length > 0) {
    // UPDATE
    const wallet = existingWallets[0];
    console.log(`\nCarteira Existente Encontrada: ${wallet.id}`);
    console.log(`Saldo Atual: ${wallet.available_quantity}`);
    
    // Calcular novos valores
    const currentInitial = Number(wallet.initial_quantity);
    const newInitial = currentInitial + totalQuantity;
    const newAvailable = Number(wallet.available_quantity) + totalQuantity;
    const newTotalPaid = Number(wallet.total_paid) + totalPaid;
    // Evitar divisão por zero caso inicial seja 0 (improvável mas bom prevenir)
    const newUnitPrice = newTotalPaid / (newInitial > 0 ? newInitial : 1);
    
    console.log(`>> ATUALIZANDO PARA: Initial ${newInitial}, Available ${newAvailable}`);
    
    const { error: updateError } = await supabase
      .from('client_packages')
      .update({
        initial_quantity: newInitial,
        available_quantity: newAvailable,
        total_paid: newTotalPaid,
        unit_price: newUnitPrice,
        updated_at: new Date()
      })
      .eq('id', wallet.id);
      
    if (updateError) console.error("Erro ao atualizar:", updateError);
    else console.log("✅ Carteira atualizada com sucesso!");

  } else {
    // INSERT
    console.log("\nNenhuma carteira ativa encontrada. Criando nova...");
    
    const { error: insertError } = await supabase
      .from('client_packages')
      .insert({
        client_id: carrierId,
        service_id: serviceId,
        sale_id: saleId,
        initial_quantity: totalQuantity,
        consumed_quantity: 0,
        available_quantity: totalQuantity,
        unit_price: unitPricePackage,
        total_paid: totalPaid,
        is_active: true
      });
      
    if (insertError) console.error("Erro ao inserir:", insertError);
    else console.log("✅ Nova carteira de pacotes criada com sucesso!");
  }
}

fixMissingPackage();
