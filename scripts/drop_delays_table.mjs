import { config } from 'dotenv';
config({ path: '.env.local' });
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: "postgresql://postgres:supertokio2024@72.61.62.227:5434/postgres"
});

async function main() {
  try {
    console.log("Dropping table mercadolivre_delays...");
    await pool.query('DROP TABLE IF EXISTS mercadolivre_delays');
    console.log("Successfully dropped table.");
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

main();
