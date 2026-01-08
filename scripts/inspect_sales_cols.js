const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
  console.log("Inspecionando tabela 'sales'...");

  // Tentar um select * limit 1 para ver as chaves retornadas
  const { data, error } = await supabase
    .from('sales')
    .select('*')
    .limit(1);

  if (error) {
    console.error("Erro ao selecionar:", error);
    return;
  }

  if (data && data.length > 0) {
    console.log("Colunas encontradas:", Object.keys(data[0]));
  } else {
    console.log("Tabela vazia ou erro.");
  }
}

inspect();
