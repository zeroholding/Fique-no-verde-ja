import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres',
});

async function run() {
  const accountRes = await pool.query(`SELECT ml_user_id, access_token FROM mercado_livre_credentials WHERE access_token IS NOT NULL LIMIT 1`);
  if (accountRes.rows.length === 0) {
    console.log("No token");
    process.exit(1);
  }
  const account = accountRes.rows[0];
  const token = account.access_token;
  const sellerId = account.ml_user_id;

  async function tryEndpoint(url) {
    console.log("\nTrying: " + url.replace(token, 'TOKEN').replace(sellerId, 'SELLER_ID'));
    try {
      const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
      const text = await res.text();
      console.log("Status:", res.status);
      console.log("Response:", text.substring(0, 300) + (text.length > 300 ? "..." : ""));
    } catch (e) {
      console.error(e.message);
    }
  }

  await tryEndpoint(`https://api.mercadolibre.com/users/${sellerId}/metrics/delayed_handling_time/orders`);
  await tryEndpoint(`https://api.mercadolibre.com/orders/search?seller=${sellerId}&tags=delayed`);
  
  process.exit(0);
}
run();
