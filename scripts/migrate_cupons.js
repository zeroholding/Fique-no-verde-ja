const { Pool } = require('pg');

const DB_CONNECTION = "postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres";

async function main() {
  const pool = new Pool({ connectionString: DB_CONNECTION });

  console.log("Iniciando migração de Cupons...");

  try {
    // 1. Criar tabela cupons
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cupons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) UNIQUE NOT NULL,
        discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
        discount_value DECIMAL(10,2) NOT NULL,
        max_uses INTEGER NULL,
        expires_at TIMESTAMP NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("Tabela 'cupons' criada/verificada com sucesso.");

    // 2. Adicionar colunas na tabela sales
    await pool.query(`
      ALTER TABLE sales 
      ADD COLUMN IF NOT EXISTS cupom_id UUID REFERENCES cupons(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;
    `);
    console.log("Colunas 'cupom_id' e 'discount_amount' adicionadas/verificadas na tabela 'sales'.");

  } catch (error) {
    console.error("Erro na migração:", error);
  } finally {
    await pool.end();
  }
}

main();
