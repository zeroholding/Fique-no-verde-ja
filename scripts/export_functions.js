const { Client } = require('pg');

// Supabase direct connection
const supabaseConn = 'postgresql://postgres:mmSpgjWDXtTSPjtM@db.xqkhmtrxcpjmxtwpqacg.supabase.co:5432/postgres';

async function exportFunctions() {
  console.log('=== EXPORTANDO FUNÇÕES DO SUPABASE ===\n');
  
  const client = new Client({ connectionString: supabaseConn, ssl: { rejectUnauthorized: false } });
  
  try {
    await client.connect();
    console.log('Conectado ao Supabase!\n');
    
    // List all user-defined functions
    const res = await client.query(`
      SELECT 
        p.proname as name,
        pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.prokind = 'f'
      ORDER BY p.proname
    `);
    
    console.log('Funções encontradas:', res.rows.length);
    
    // Save to file
    const fs = require('fs');
    let output = '-- Supabase Functions Export\n\n';
    
    res.rows.forEach(row => {
      console.log(`  - ${row.name}`);
      output += `-- Function: ${row.name}\n`;
      output += row.definition + ';\n\n';
    });
    
    fs.writeFileSync('supabase_functions.sql', output);
    console.log('\n✅ Exportado para: supabase_functions.sql');
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

exportFunctions();
