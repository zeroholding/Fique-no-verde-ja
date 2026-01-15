const { Client } = require('pg');
const fs = require('fs');

// Supabase (source) - to get schema
const supabaseConn = 'postgresql://postgres:mmSpgjWDXtTSPjtM@db.xqkhmtrxcpjmxtwpqacg.supabase.co:5432/postgres';

async function exportSchema() {
  console.log('=== EXPORTANDO SCHEMA DO SUPABASE ===\n');
  
  const client = new Client({ connectionString: supabaseConn, ssl: { rejectUnauthorized: false } });
  
  try {
    await client.connect();
    console.log('Conectado ao Supabase!\n');

    // Get all table definitions
    const result = await client.query(`
      SELECT 
        table_name,
        column_name,
        data_type,
        character_maximum_length,
        column_default,
        is_nullable,
        udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

    // Group by table
    const tables = {};
    for (const row of result.rows) {
      if (!tables[row.table_name]) tables[row.table_name] = [];
      tables[row.table_name].push(row);
    }

    let ddl = '-- Schema exported from Supabase\n\n';

    // Generate CREATE TABLE statements
    for (const [tableName, columns] of Object.entries(tables)) {
      ddl += `CREATE TABLE IF NOT EXISTS "${tableName}" (\n`;
      
      const colDefs = columns.map(col => {
        let type = col.data_type;
        if (col.udt_name === 'uuid') type = 'UUID';
        else if (col.udt_name === 'text') type = 'TEXT';
        else if (col.udt_name === 'int4') type = 'INTEGER';
        else if (col.udt_name === 'int8') type = 'BIGINT';
        else if (col.udt_name === 'float8') type = 'DOUBLE PRECISION';
        else if (col.udt_name === 'numeric') type = 'NUMERIC';
        else if (col.udt_name === 'bool') type = 'BOOLEAN';
        else if (col.udt_name === 'timestamptz') type = 'TIMESTAMPTZ';
        else if (col.udt_name === 'timestamp') type = 'TIMESTAMP';
        else if (col.udt_name === 'date') type = 'DATE';
        else if (col.udt_name === 'varchar') type = `VARCHAR(${col.character_maximum_length || 255})`;
        else if (col.udt_name === 'jsonb') type = 'JSONB';
        else if (col.udt_name === 'json') type = 'JSON';
        
        let def = `  "${col.column_name}" ${type}`;
        if (col.column_default) {
          // Clean up default values
          let defaultVal = col.column_default;
          if (defaultVal.includes('gen_random_uuid()')) defaultVal = 'gen_random_uuid()';
          if (defaultVal.includes('::')) defaultVal = defaultVal.split('::')[0].replace(/'/g, "'");
          def += ` DEFAULT ${defaultVal}`;
        }
        if (col.is_nullable === 'NO') def += ' NOT NULL';
        return def;
      });
      
      ddl += colDefs.join(',\n');
      ddl += '\n);\n\n';
    }

    // Add uuid extension
    ddl = 'CREATE EXTENSION IF NOT EXISTS "pgcrypto";\n\n' + ddl;

    fs.writeFileSync('schema_supabase.sql', ddl);
    console.log(`✅ Schema salvo em: schema_supabase.sql`);
    console.log(`Tabelas: ${Object.keys(tables).length}`);

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

exportSchema();
