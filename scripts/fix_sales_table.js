const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function fixSalesTable() {
  console.log('=== CORRIGINDO TABELA SALES ===\n');
  
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('Conectado!\n');
    
    // Drop and recreate sales with ALL columns from backup
    console.log('Dropando tabela sales...');
    await client.query('DROP TABLE IF EXISTS sales CASCADE');
    
    console.log('Criando tabela sales com schema completo...');
    await client.query(`
      CREATE TABLE "sales" (
        "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "client_id" UUID,
        "attendant_id" UUID,
        "sale_date" TIMESTAMPTZ,
        "observations" TEXT,
        "status" VARCHAR(50) DEFAULT 'pendente',
        "payment_method" VARCHAR(100),
        "general_discount_type" VARCHAR(20),
        "general_discount_value" NUMERIC DEFAULT 0,
        "subtotal" NUMERIC DEFAULT 0,
        "total_discount" NUMERIC DEFAULT 0,
        "total" NUMERIC DEFAULT 0,
        "confirmed_at" TIMESTAMPTZ,
        "cancelled_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ DEFAULT NOW(),
        "commission_amount" NUMERIC DEFAULT 0,
        "commission_policy_id" UUID,
        "discount_amount" NUMERIC DEFAULT 0,
        "refund_total" NUMERIC DEFAULT 0,
        "sale_number" INTEGER
      );
    `);
    
    console.log('✅ Tabela sales recriada com sucesso!');
    console.log('\nAgora rode: node scripts/restore_to_coolify.js');
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

fixSalesTable();
