import { config } from 'dotenv';
config({ path: '.env.local' });
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: "postgresql://postgres:supertokio2024@72.61.62.227:5434/postgres"
});

async function main() {
  try {
    const creds = await pool.query("SELECT ml_user_id, access_token, user_id FROM mercado_livre_credentials LIMIT 1");
    if (creds.rows.length === 0) { console.log("No credentials."); return; }
    const { ml_user_id, access_token, user_id } = creds.rows[0];
    
    console.log("Checking DB records for user", user_id, "and account", ml_user_id);
    
    const countRes = await pool.query('SELECT COUNT(*) FROM mercadolivre_delays WHERE user_id = $1', [user_id]);
    console.log("Total entries in DB for this user:", countRes.rows[0].count);

    const counts = await pool.query('SELECT status, COUNT(*) FROM mercadolivre_delays WHERE user_id = $1 GROUP BY status', [user_id]);
    console.log("Status distribution:", counts.rows);
    
    // Check missing limit date
    const limits = await pool.query('SELECT COUNT(*) FROM mercadolivre_delays WHERE limit_date IS NULL');
    console.log("Entries with NULL limit date:", limits.rows[0].count);

    const all = await pool.query('SELECT id, product_name, limit_date, shipped_date, delay_hours, delay_range, status FROM mercadolivre_delays WHERE user_id = $1 LIMIT 5', [user_id]);
    console.log("Sample records:", all.rows);
    
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

main();
