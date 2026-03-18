import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: "postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres",
});

async function run() {
  try {
    const res = await pool.query("SELECT id, order_id, resource_id, resource FROM mercado_livre_claims WHERE id = '5485594322'");
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

run();
