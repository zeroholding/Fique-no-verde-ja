const { Client } = require('pg');
const fs = require('fs');

// Coolify PostgreSQL
const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function applySchema() {
  console.log('=== APLICANDO SCHEMA NO COOLIFY ===\n');
  
  // Read and fix schema - replace uuid_generate_v4 with gen_random_uuid
  let schemaSQL = fs.readFileSync('schema_supabase.sql', 'utf-8');
  schemaSQL = schemaSQL.replace(/uuid_generate_v4\(\)/g, 'gen_random_uuid()');
  
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('Conectado ao Coolify PostgreSQL!\n');
    
    // Split by CREATE TABLE and execute each
    const statements = schemaSQL.split(/;\s*\n/).filter(s => s.trim());
    
    for (const stmt of statements) {
      if (stmt.trim()) {
        try {
          await client.query(stmt + ';');
          const match = stmt.match(/CREATE TABLE.*?"(\w+)"/i);
          if (match) console.log(`✓ Tabela ${match[1]} criada`);
          else if (stmt.includes('EXTENSION')) console.log('✓ Extension criada');
        } catch (err) {
          if (err.code === '42P07') {
            // Table already exists
            const match = stmt.match(/CREATE TABLE.*?"(\w+)"/i);
            if (match) console.log(`- Tabela ${match[1]} já existe`);
          } else {
            console.error(`Erro: ${err.message.slice(0, 100)}`);
          }
        }
      }
    }
    
    console.log('\n✅ Schema aplicado!');
    
  } catch (error) {
    console.error('Erro de conexão:', error.message);
  } finally {
    await client.end();
  }
}

applySchema();
