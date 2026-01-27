
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
});

async function run() {
  await client.connect();
  const tmId = '4be828e2-86a2-4bc9-a909-e5212c809ef8';

  try {
    console.log("Simulating Updated API Logic (Dynamic Consumption) on Prod DB (5434)...");
    
    // The Exact Logic pushed to /api/packages/route.ts
    const sql = `
      SELECT
        cp.initial_quantity,
        cp.available_quantity as static_avail,
        
        -- Consumo Dinâmico (Soma consumos onde a venda NÃO está cancelada)
        COALESCE(
          (SELECT SUM(pc.quantity) 
           FROM package_consumptions pc 
           JOIN sales s2 ON pc.sale_id = s2.id 
           WHERE pc.package_id = cp.id 
           AND s2.status != 'cancelada'
          ), 0
        ) as dynamic_consumed,

        -- Saldo Disponível Calculado (Inicial - Consumo Real)
        (cp.initial_quantity - COALESCE(
          (SELECT SUM(pc.quantity) 
           FROM package_consumptions pc 
           JOIN sales s2 ON pc.sale_id = s2.id 
           WHERE pc.package_id = cp.id 
           AND s2.status != 'cancelada'
          ), 0
        )) as calculated_available

      FROM client_packages cp
      WHERE cp.client_id = $1
    `;

    const res = await client.query(sql, [tmId]);
    const row = res.rows[0];

    console.log("--- RESULT ---");
    console.log(`Static Available (Table): ${row.static_avail}`);
    console.log(`Initial:               ${row.initial_quantity}`);
    console.log(`Dynamic Consumed:      -${row.dynamic_consumed}`);
    console.log(`Calculated Available:  ${row.calculated_available}`);
    console.log("-----------------------");
    console.log(`User sees 269`);
    const diff = Number(row.calculated_available) - 269;
    console.log(`Difference: ${diff}`);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
