
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres',
});

async function run() {
  await client.connect();
  try {
    const sql = `
        WITH invisible_reloads_sum AS (
            SELECT 
                s.client_id, 
                SUM(si.quantity) as total_qty
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            WHERE si.sale_type = '02' 
            AND s.status != 'cancelada'
            AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE sale_id IS NOT NULL)
            GROUP BY s.client_id
        )
        SELECT
          cp.sale_id::text AS id,
          cp.client_id,
          (cp.total_paid - COALESCE(
              (SELECT SUM(s2.total) 
               FROM sales s2 
               JOIN sale_items si2 ON s2.id = si2.sale_id
               WHERE s2.client_id = cp.client_id 
               AND si2.sale_type = '02'
               AND s2.status != 'cancelada'
               AND s2.id NOT IN (SELECT sale_id FROM client_packages)
              ), 0)
          ) AS value,
          (cp.initial_quantity - COALESCE(irs.total_qty, 0)) AS quantity,
          'Pacote Base' as type
        FROM client_packages cp
        JOIN clients c ON cp.client_id = c.id
        LEFT JOIN invisible_reloads_sum irs ON cp.client_id = irs.client_id
        WHERE cp.initial_quantity > COALESCE(irs.total_qty, 0)
        
        UNION ALL

        SELECT
          s.id::text AS id,
          s.client_id,
          s.total AS value,
          si.quantity AS quantity,
          'Recarga Avulsa' as type
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        JOIN clients c ON s.client_id = c.id
        WHERE s.status != 'cancelada'
        AND si.sale_type = '02'
        AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE sale_id IS NOT NULL)
    `;

    const res = await client.query(sql);

    // Filter for TM (need client ID or name)
    const tmClient = await client.query("SELECT id FROM clients WHERE name = 'TM'");
    const tmId = tmClient.rows[0].id;

    const tmOps = res.rows.filter(r => r.client_id === tmId);
    
    console.log("--- TM Operations ---");
    let totalQty = 0;
    tmOps.forEach(op => {
        console.log(`${op.type}: ${op.quantity}`);
        totalQty += Number(op.quantity);
    });
    console.log(`Total Acquired (Calculated): ${totalQty}`);

    // Fetch Consumptions
    const consRes = await client.query(`
        SELECT pc.quantity 
        FROM package_consumptions pc
        JOIN client_packages cp ON pc.package_id = cp.id
        WHERE cp.client_id = $1
    `, [tmId]);
    
    let totalConsumed = consRes.rows.reduce((sum, r) => sum + Number(r.quantity), 0);
    console.log(`Total Consumed: ${totalConsumed}`);

    console.log(`FINAL BALANCE: ${totalQty - totalConsumed}`);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
