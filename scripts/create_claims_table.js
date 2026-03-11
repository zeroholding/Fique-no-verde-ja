require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function main() {
  try {
    const client = await pool.connect();
    
    console.log('Criando tabela mercado_livre_claims...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS mercado_livre_claims (
        id BIGINT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ml_user_id VARCHAR(50) NOT NULL,
        resource_id VARCHAR(50),
        status VARCHAR(50),
        type VARCHAR(50),
        stage VARCHAR(50),
        reason_id VARCHAR(50),
        resource VARCHAR(50),
        date_created VARCHAR(50),
        last_updated VARCHAR(50),
        resolution_reason VARCHAR(255),
        resolution_closed_by VARCHAR(50),
        affects_reputation VARCHAR(20),
        has_incentive BOOLEAN DEFAULT false,
        due_date VARCHAR(50),
        message_count INTEGER DEFAULT 0,
        synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Indexes for fast fetching and pagination
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ml_claims_user_ml_user_update 
      ON mercado_livre_claims (user_id, ml_user_id, last_updated DESC);
    `);

    console.log('Tabela criada com sucesso!');
    client.release();
  } catch (err) {
    console.error('Erro ao criar tabela:', err);
  } finally {
    pool.end();
  }
}

main();
