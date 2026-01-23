const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function fixSchema() {
  console.log('=== CORRIGINDO SCHEMA NO COOLIFY ===\n');
  
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('Conectado!\n');
    
    // 1. Add PRIMARY KEYS
    console.log('--- ADICIONANDO PRIMARY KEYS ---');
    const pks = [
      { table: 'client_origins', col: 'id' },
      { table: 'service_price_ranges', col: 'id' },
      { table: 'users', col: 'id' },
      { table: 'clients', col: 'id' },
      { table: 'products', col: 'id' },
      { table: 'services', col: 'id' },
      { table: 'sessions', col: 'id' },
      { table: 'holidays', col: 'id' },
      { table: 'mercado_livre_credentials', col: 'id' },
      { table: 'commission_policies', col: 'id' },
      { table: 'price_ranges', col: 'id' },
      { table: 'sale_items', col: 'id' },
      { table: 'sale_refunds', col: 'id' },
      { table: 'client_packages', col: 'id' },
      { table: 'commissions', col: 'id' },
      { table: 'package_consumptions', col: 'id' },
    ];
    
    for (const pk of pks) {
      try {
        await client.query(`ALTER TABLE "${pk.table}" ADD PRIMARY KEY ("${pk.col}")`);
        console.log(`✅ PK: ${pk.table}`);
      } catch (e) {
        if (e.message.includes('already exists')) {
          console.log(`⏭️  PK já existe: ${pk.table}`);
        } else {
          console.log(`❌ ${pk.table}: ${e.message}`);
        }
      }
    }
    
    // 2. Add UNIQUE INDEXES
    console.log('\n--- ADICIONANDO UNIQUE INDEXES ---');
    const uniqueIdx = [
      { name: 'client_origins_name_key', table: 'client_origins', col: 'name' },
      { name: 'users_email_key', table: 'users', col: 'email' },
      { name: 'products_sku_key', table: 'products', col: 'sku' },
      { name: 'services_name_key', table: 'services', col: 'name' },
      { name: 'holidays_date_key', table: 'holidays', col: 'date' },
    ];
    
    for (const idx of uniqueIdx) {
      try {
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "${idx.name}" ON "${idx.table}" ("${idx.col}")`);
        console.log(`✅ Index: ${idx.name}`);
      } catch (e) {
        console.log(`❌ ${idx.name}: ${e.message}`);
      }
    }
    
    // Special: unique_active_client_package_service (composite unique)
    try {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_client_package_service" 
        ON "client_packages" ("client_id", "service_id") 
        WHERE is_active = true
      `);
      console.log('✅ Index: unique_active_client_package_service');
    } catch (e) {
      console.log(`❌ unique_active_client_package_service: ${e.message}`);
    }
    
    // 3. Add uuid-ossp extension
    console.log('\n--- EXTENSÕES ---');
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      console.log('✅ Extensão: uuid-ossp');
    } catch (e) {
      console.log(`❌ uuid-ossp: ${e.message}`);
    }
    
    console.log('\n=== CORREÇÕES CONCLUÍDAS ===');
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

fixSchema();
