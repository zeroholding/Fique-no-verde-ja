const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    const res = await pool.query('SELECT * FROM mercadolivre_delays LIMIT 5');
    console.log("Delays in DB:", res.rowCount);
    console.log(res.rows);
    
    const countRes = await pool.query('SELECT COUNT(*) FROM mercadolivre_delays');
    console.log("Total entries:", countRes.rows[0].count);
    
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
main();
