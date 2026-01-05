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

// Dados extraídos do print do usuário
const packagesToRestore = [
    { name: 'FLASH', saldo: 128, adquiridos: 182, consumidos: 54, valorTotal: 1280.00 },
    { name: 'M3', saldo: 121, adquiridos: 121, consumidos: 0, valorTotal: 1210.00 },
    { name: 'W.A', saldo: 200, adquiridos: 200, consumidos: 0, valorTotal: 2000.00 },
    { name: 'LVM', saldo: 74, adquiridos: 74, consumidos: 0, valorTotal: 740.00 },
    { name: 'PEX', saldo: 1929, adquiridos: 1929, consumidos: 0, valorTotal: 15432.00 },
    { name: 'SOS', saldo: 145, adquiridos: 145, consumidos: 0, valorTotal: 1450.00 },
    { name: 'TM', saldo: 785, adquiridos: 785, consumidos: 0, valorTotal: 6280.00 },
    { name: 'J3', saldo: 936, adquiridos: 936, consumidos: 0, valorTotal: 7020.00 },
];

async function restore() {
    console.log("=== RESTAURANDO PACOTES ===\n");
    
    // 0. Buscar um service_id válido (qualquer serviço ativo)
    const { data: services } = await supabase.from('services').select('id, name').eq('is_active', true).limit(1);
    const defaultServiceId = services?.[0]?.id;
    console.log("Service ID padrão:", defaultServiceId, services?.[0]?.name);
    
    if (!defaultServiceId) {
        console.error("Nenhum serviço encontrado! Abortando.");
        return;
    }
    
    // 1. Buscar IDs dos clientes pelo nome
    const { data: clients } = await supabase
        .from('clients')
        .select('id, name')
        .eq('client_type', 'package');
    
    console.log("Clientes tipo 'package' encontrados:", clients?.length || 0);
    
    const clientMap = new Map();
    clients?.forEach(c => {
        clientMap.set(c.name.toUpperCase().trim(), c.id);
    });
    
    console.log("Clientes no mapa:", [...clientMap.keys()]);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const pkg of packagesToRestore) {
        const clientId = clientMap.get(pkg.name.toUpperCase().trim());
        
        if (!clientId) {
            console.error(`❌ Cliente não encontrado: ${pkg.name}`);
            errorCount++;
            continue;
        }
        
        // Calcular preço unitário
        const unitPrice = pkg.valorTotal / pkg.adquiridos;
        
        // Inserir pacote com colunas corretas
        const { error } = await supabase.from('client_packages').insert({
            client_id: clientId,
            service_id: defaultServiceId, // FK requerida
            initial_quantity: pkg.adquiridos,
            consumed_quantity: pkg.consumidos,
            available_quantity: pkg.saldo,
            unit_price: unitPrice,
            total_paid: pkg.valorTotal,
            is_active: true,
            created_at: new Date().toISOString()
        });
        
        if (error) {
            console.error(`❌ Erro ao inserir ${pkg.name}:`, error.message);
            errorCount++;
        } else {
            console.log(`✅ ${pkg.name}: Saldo ${pkg.saldo}/${pkg.adquiridos} (R$ ${pkg.valorTotal.toFixed(2)})`);
            successCount++;
        }
    }
    
    console.log(`\n=== RESULTADO ===`);
    console.log(`Sucesso: ${successCount}`);
    console.log(`Erros: ${errorCount}`);
}

restore();
