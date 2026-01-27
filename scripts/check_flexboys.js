
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
});

async function run() {
  await client.connect();
  try {
    // 1. Get Client ID
    const clientRes = await client.query(`SELECT id FROM clients WHERE name ILIKE '%FLEXBOYS%'`);
    if (clientRes.rows.length === 0) {
        console.log("Cliente FLEXBOYS não encontrado.");
        return;
    }
    const clientId = clientRes.rows[0].id;
    console.log(`Cliente: FLEXBOYS (ID: ${clientId})`);

    // 2. Run Dashboard Logic Query (The one from statement/route.ts)
    // Logic: 
    //   Row 1 (Base): Initial - InvisibleSums
    //   Row 2..N (Reloads): Invisible Items
    //   Row N+1.. (Consumptions): Negative Values
    // Sum of all 'value' (Wait, balanceQuantityCurrent sums 'quantity')
    
    // Simplified Calculation logic used in statement route summary:
    // Balance = (Initial - Invis) + Invis - Consumed = Initial - Consumed.
    // NOTE: This assumes Initial INCLUDES reloads. 
    // Let's verify if Initial includes reloads. 
    // Or just run the sum of operations as the dashboard does.

    // A. Operations (Purchases)
    const purchasesRes = await client.query(`
        WITH invisible_reloads_sum AS (
            SELECT 
                s.client_id, 
                SUM(si.quantity) as total_qty
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            WHERE si.sale_type = '02' 
            AND s.status != 'cancelada'
            AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE sale_id IS NOT NULL)
            AND s.client_id = $1
            GROUP BY s.client_id
        )
        SELECT
          (cp.initial_quantity - COALESCE(irs.total_qty, 0)) AS quantity,
          'Base' as type
        FROM client_packages cp
        LEFT JOIN invisible_reloads_sum irs ON cp.client_id = irs.client_id
        WHERE cp.client_id = $1
        AND cp.initial_quantity > COALESCE(irs.total_qty, 0)
        
        UNION ALL

        SELECT
          si.quantity AS quantity,
          'Reload' as type
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        WHERE s.client_id = $1
        AND s.status != 'cancelada'
        AND si.sale_type = '02'
        AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE sale_id IS NOT NULL)
    `, [clientId]);

    let totalAcquired = 0;
    purchasesRes.rows.forEach(r => totalAcquired += Number(r.quantity));

    // B. Consumptions
    const consumptionsRes = await client.query(`
        SELECT
          -pc.quantity AS quantity
        FROM package_consumptions pc
        JOIN client_packages cp ON pc.package_id = cp.id
        JOIN sales s ON pc.sale_id = s.id
        WHERE cp.client_id = $1
        AND s.status != 'cancelada'
    `, [clientId]);
    
    let totalConsumed = 0;
    consumptionsRes.rows.forEach(r => totalConsumed += Number(r.quantity)); // Negative values

    const finalBalance = totalAcquired + totalConsumed; // (+Acquired) + (-Consumed)

    console.log(`\n--- SALDO CALCULADO (DASHBOARD) ---`);
    console.log(finalBalance);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
