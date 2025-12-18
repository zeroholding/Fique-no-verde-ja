
const { Client } = require('pg');
require('dotenv').config();

async function inspectM3() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: false // Disable SSL
  });

  try {
    await client.connect();
    console.log("Connected to DB");

    // 1. Find the client "M3"
    const clientRes = await client.query("SELECT id, name FROM clients WHERE name ILIKE '%M3%'");
    console.log("Clients found:", clientRes.rows);

    if (clientRes.rows.length === 0) {
      console.log("M3 not found");
      return;
    }

    const clientId = clientRes.rows[0].id;

    // 2. Find client packages for this client
    const packagesRes = await client.query("SELECT * FROM client_packages WHERE client_id = $1", [clientId]);
    console.log("Packages for M3:", packagesRes.rows);

    if (packagesRes.rows.length > 0) {
      const packageId = packagesRes.rows[0].id;

      // 3. Find consumptions for this package
      const consumptionsRes = await client.query("SELECT * FROM package_consumptions WHERE package_id = $1", [packageId]);
      console.log("Consumptions for M3 package:", consumptionsRes.rows);
    }

    // 4. Find recent sales for this client
    const salesRes = await client.query("SELECT * FROM sales WHERE client_id = $1 ORDER BY created_at DESC LIMIT 5", [clientId]);
    console.log("Recent sales for M3:", salesRes.rows);

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

inspectM3();
