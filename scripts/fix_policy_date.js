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

async function fix() {
    console.log("=== CORRIGO DATA DE INÍCIO ===\n");
    
    // Atualizar a política nova
    const { error } = await supabase
        .from('commission_policies')
        .update({ valid_from: '2026-01-01' })
        .eq('value', 2.5) // Identificar pelo valor único de 2.5
        .eq('name', 'Comissão Padrão - Dias Úteis'); // E pelo nome
        
    if (error) {
        console.error("Erro ao atualizar data:", error.message);
    } else {
        console.log("Data de início corrigida para 2026-01-01 ✅");
    }
}

fix();
