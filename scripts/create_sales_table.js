const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function createSalesTable() {
  console.log('=== CRIANDO TABELA SALES MANUALMENTE ===\n');
  
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('Conectado!\n');
    
    // Create sales table with all columns from backup
    await client.query(`
      CREATE TABLE IF NOT EXISTS "sales" (
        "id" UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
        "discount_amount" NUMERIC DEFAULT 0,
        "total" NUMERIC DEFAULT 0,
        "refund_total" NUMERIC DEFAULT 0,
        "commission_amount" NUMERIC DEFAULT 0,
        "confirmed_at" TIMESTAMPTZ,
        "cancelled_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    console.log('✅ Tabela sales criada com sucesso!');
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

createSalesTable();
