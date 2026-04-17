const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    console.log("Creating mercadolivre_delays table...");
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mercadolivre_delays (
        id VARCHAR(50) NOT NULL,
        ml_user_id VARCHAR(50) NOT NULL,
        user_id BIGINT,
        product_name VARCHAR(255),
        shipping_mode VARCHAR(50),
        limit_date TIMESTAMP WITH TIME ZONE,
        shipped_date TIMESTAMP WITH TIME ZONE,
        delay_hours FLOAT,
        delay_range VARCHAR(50),
        status VARCHAR(50),
        synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      );
    `);

    console.log("Table created.");

    // Create indices
    console.log("Creating indices...");
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ml_delays_account ON mercadolivre_delays (ml_user_id);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ml_delays_range ON mercadolivre_delays (delay_range);
    `);

    // We do NOT use user_id because the other APIs often filter just by ml_user_id. 
    // Adding user_id just in case for linking with our user.
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ml_delays_limit ON mercadolivre_delays (limit_date DESC);
    `);

    console.log("Database migration for Delays Module complete.");
  } catch (err) {
    console.error("Error running migration:", err);
  } finally {
    await pool.end();
  }
}

run();
