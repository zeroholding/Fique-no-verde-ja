const { Client } = require('pg');

const supabaseConn = 'postgresql://postgres:mmSpgjWDXtTSPjtM@db.xqkhmtrxcpjmxtwpqacg.supabase.co:5432/postgres';
const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function migrateForeignKeys() {
  console.log('=== MIGRANDO FOREIGN KEYS PARA COOLIFY ===\n');
  
  const supabase = new Client({ connectionString: supabaseConn, ssl: { rejectUnauthorized: false } });
  const coolify = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await supabase.connect();
    await coolify.connect();
    console.log('Conectado a ambos!\n');
    
    // Get FK definitions from Supabase
    const fkQuery = `
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    `;
    
    const fks = await supabase.query(fkQuery);
    console.log(`Encontradas ${fks.rows.length} FKs no Supabase\n`);
    
    let success = 0;
    let failed = 0;
    
    for (const fk of fks.rows) {
      try {
        await coolify.query(`
          ALTER TABLE "${fk.table_name}"
          ADD CONSTRAINT "${fk.constraint_name}"
          FOREIGN KEY ("${fk.column_name}")
          REFERENCES "${fk.foreign_table_name}" ("${fk.foreign_column_name}")
          ON DELETE SET NULL
        `);
        console.log(`✅ ${fk.constraint_name}`);
        success++;
      } catch (e) {
        if (e.message.includes('already exists')) {
          console.log(`⏭️  Já existe: ${fk.constraint_name}`);
        } else {
          console.log(`❌ ${fk.constraint_name}: ${e.message.split('\n')[0]}`);
          failed++;
        }
      }
    }
    
    console.log(`\n=== RESULTADO: ${success} criadas, ${failed} falharam ===`);
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await supabase.end();
    await coolify.end();
  }
}

migrateForeignKeys();
