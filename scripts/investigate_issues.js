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

async function investigate() {
    console.log("=== INVESTIGAÇÃO DE PROBLEMAS ===\n");
    
    // 1. PROBLEMA DAS DATAS 2027
    console.log("--- PROBLEMA 1: DATAS EM 2027 ---");
    const { data: sales2027 } = await supabase
        .from('sales')
        .select('id, sale_date, created_at, observations')
        .gte('sale_date', '2027-01-01')
        .limit(5);
    
    console.log(`Vendas com data >= 2027: ${sales2027?.length || 0}`);
    if (sales2027?.length) {
        sales2027.forEach(s => {
            console.log(`  ID ${s.id.slice(0,8)}... | sale_date: ${s.sale_date} | obs: ${(s.observations || '').slice(0, 30)}`);
        });
    }
    
    // 2. VERIFICAR DIA 06/01/2025
    console.log("\n--- PROBLEMA 2: DIA 06/01/2025 ---");
    const { data: sales0601 } = await supabase
        .from('sales')
        .select('id, sale_date, sale_items(product_name, quantity)')
        .gte('sale_date', '2025-01-06T00:00:00')
        .lt('sale_date', '2025-01-07T00:00:00');
    
    console.log(`Vendas no dia 06/01/2025: ${sales0601?.length || 0}`);
    
    let reclamacoesCount = 0, reclamacoesQtd = 0;
    let atrasosCount = 0, atrasosQtd = 0;
    
    sales0601?.forEach(sale => {
        sale.sale_items?.forEach(item => {
            const name = (item.product_name || '').toLowerCase();
            if (name.includes('reclama')) {
                reclamacoesCount++;
                reclamacoesQtd += item.quantity || 0;
            } else if (name.includes('atras')) {
                atrasosCount++;
                atrasosQtd += item.quantity || 0;
            }
        });
    });
    
    console.log(`  Esperado: 9 Reclamações (153 un) + 14 Atrasos (841 un) = 23 vendas`);
    console.log(`  Encontrado: ${reclamacoesCount} Reclamações (${reclamacoesQtd} un) + ${atrasosCount} Atrasos (${atrasosQtd} un) = ${sales0601?.length || 0} vendas`);
    
    // 3. VERIFICAR % DE COMISSÃO USADA
    console.log("\n--- PROBLEMA 3: % DE COMISSÃO ---");
    const { data: commissions } = await supabase
        .from('commissions')
        .select('commission_rate, commission_type')
        .limit(10);
    
    const rates = [...new Set(commissions?.map(c => c.commission_rate) || [])];
    console.log(`Taxas de comissão encontradas: ${rates.join(', ')}%`);
    console.log(`Esperado dias úteis (01/25-11/25): 2.5%`);
    console.log(`Aplicado: 3.5%`);
}

investigate();
