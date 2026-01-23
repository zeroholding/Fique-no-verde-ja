const { Client } = require('pg');
const fs = require('fs');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function applyFunctions() {
  console.log('=== CRIANDO FUNÇÕES NO COOLIFY ===\n');
  
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('Conectado ao Coolify!\n');
    
    // Read SQL file
    const sql = fs.readFileSync('supabase_functions.sql', 'utf-8');
    
    // Split by function (each CREATE OR REPLACE is a separate statement)
    const statements = sql.split(/;[\r\n]+--/).filter(s => s.trim());
    
    for (const stmt of statements) {
      // Clean up and add semicolon
      const cleanStmt = stmt.replace('-- Supabase Functions Export', '').trim();
      if (cleanStmt.includes('CREATE OR REPLACE FUNCTION')) {
        const funcName = cleanStmt.match(/FUNCTION public\.(\w+)/)?.[1] || 'unknown';
        try {
          await client.query(cleanStmt + ';');
          console.log(`✅ Criada: ${funcName}`);
        } catch (err) {
          console.log(`❌ Erro em ${funcName}:`, err.message);
        }
      }
    }
    
    // Verify
    const res = await client.query(`
      SELECT proname as name
      FROM pg_proc
      JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
      WHERE pg_namespace.nspname = 'public'
        AND pg_proc.prokind = 'f'
    `);
    
    console.log('\nFunções no Coolify agora:', res.rows.map(r => r.name).join(', '));
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

applyFunctions();
