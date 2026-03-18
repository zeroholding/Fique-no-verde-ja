import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: "postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres",
});

async function run() {
  try {
    const res = await pool.query("SELECT access_token FROM mercado_livre_credentials ORDER BY updated_at DESC LIMIT 1");
    if (res.rows.length === 0) return;
    const token = res.rows[0].access_token;
    
    const targetReasons = ['PNR9561', 'PDD9956', 'PNR9504', 'PNR9509', 'PDD9507'];
    
    console.log("Analyzing reasons via ML API:");
    for (const rid of targetReasons) {
      const r = await fetch(`https://api.mercadolibre.com/post-purchase/v1/claims/reasons/${rid}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await r.json();
      console.log(`${rid}: ${json.description || 'No description'} (Type: ${json.type || 'N/A'})`);
    }

  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

run();
