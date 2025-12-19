
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function audit() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not found in .env.local");
    return;
  }

  // Common patterns for Supabase/Neon: if it fails with SSL, try without.
  const configs = [
    { connectionString: url, ssl: { rejectUnauthorized: false } },
    { connectionString: url, ssl: false }
  ];

  let client;
  let connected = false;

  for (const config of configs) {
    console.log(`Attempting connection with SSL: ${JSON.stringify(config.ssl)}`);
    client = new Client(config);
    try {
      await client.connect();
      console.log("Connected successfully!");
      connected = true;
      break;
    } catch (err) {
      console.log(`Failed with SSL ${JSON.stringify(config.ssl)}: ${err.message}`);
      await client.end();
    }
  }

  if (!connected) {
    console.error("Could not connect to DB with any config.");
    return;
  }

  try {
    // 1. Get last 5 sales to be sure we see the right one
    const recentSales = await client.query(`
      SELECT s.id, s.total, s.client_id, c.name as client_name, s.created_at, s.observations
      FROM sales s
      JOIN clients c ON s.client_id = c.id
      ORDER BY s.created_at DESC
      LIMIT 5
    `);
    
    console.log("--- RECENT SALES ---");
    console.table(recentSales.rows);

    for (const sale of recentSales.rows) {
        console.log(`\nAudit for Sale ID: ${sale.id} (${sale.client_name})`);
        
        // 2. Get sale items
        const itemsRes = await client.query(`
          SELECT id, product_name, quantity, sale_type
          FROM sale_items
          WHERE sale_id = $1
        `, [sale.id]);
        console.log("Items:");
        console.table(itemsRes.rows);

        // 3. Get consumptions
        const consumptionRes = await client.query(`
          SELECT pc.*, cp.client_id as pkg_owner_id
          FROM package_consumptions pc
          JOIN client_packages cp ON pc.package_id = cp.id
          WHERE pc.sale_id = $1
        `, [sale.id]);
        
        if (consumptionRes.rows.length > 0) {
            console.log("Consumptions Found:");
            console.table(consumptionRes.rows);
        } else {
            console.log("NO CONSUMPTION RECORDS FOUND for this sale.");
        }
    }

  } catch (err) {
    console.error("Query Error:", err);
  } finally {
    await client.end();
  }
}

audit();
