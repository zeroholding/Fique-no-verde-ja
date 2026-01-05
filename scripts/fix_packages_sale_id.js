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

async function fixPackages() {
    console.log("=== CORRIGINDO PACOTES SEM SALE_ID ===\n");
    
    // 1. Buscar pacotes sem sale_id
    const { data: packages } = await supabase
        .from('client_packages')
        .select('id, client_id, total_paid')
        .is('sale_id', null);
    
    console.log(`Pacotes sem sale_id: ${packages?.length || 0}`);
    
    if (!packages?.length) {
        console.log("Nada a fazer.");
        return;
    }
    
    // 2. Buscar um user_id válido (admin ou qualquer um)
    const { data: users } = await supabase.from('users').select('id').limit(1);
    const attendantId = users?.[0]?.id;
    console.log("Attendant ID:", attendantId);
    
    // 3. Para cada pacote, criar uma venda "fantasma" e linkkar
    for (const pkg of packages) {
        // Criar sale
        const { data: sale, error: saleErr } = await supabase.from('sales').insert({
            client_id: pkg.client_id,
            attendant_id: attendantId,
            sale_date: new Date().toISOString(),
            payment_method: 'pix',
            status: 'confirmada',
            subtotal: pkg.total_paid,
            total_discount: 0,
            total: pkg.total_paid,
            observations: '[RESTAURAÇÃO] Pacote importado manualmente'
        }).select('id').single();
        
        if (saleErr) {
            console.error(`❌ Erro ao criar sale para pkg ${pkg.id}:`, saleErr.message);
            continue;
        }
        
        // Atualizar pacote com sale_id
        const { error: updateErr } = await supabase
            .from('client_packages')
            .update({ sale_id: sale.id })
            .eq('id', pkg.id);
        
        if (updateErr) {
            console.error(`❌ Erro ao atualizar pkg ${pkg.id}:`, updateErr.message);
        } else {
            console.log(`✅ Pacote ${pkg.id} linkado à venda ${sale.id}`);
        }
    }
    
    console.log("\nConcluído!");
}

fixPackages();
