
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
});

// Data from Screenshots
const dashboardData = {
    'D44': { balance: 139, acquired: 200, consumed: 61 },
    'TM': { balance: 269, acquired: 1785, consumed: 1516 },
    'J3': { balance: 510, acquired: 1936, consumed: 1426 },
    'FLEXBOYS': { balance: 155, acquired: 200, consumed: 45 },
    'FLASH': { balance: 49, acquired: 182, consumed: 133 },
    'WDK': { balance: 36, acquired: 100, consumed: 64 },
    'PEX': { balance: 1909, acquired: 1929, consumed: 20 },
    'LVM': { balance: 63, acquired: 74, consumed: 11 },
    'SOS': { balance: 0, acquired: 208, consumed: 208 },
    'FASTFLEX': { balance: 21, acquired: 35, consumed: 14 },
    'M3': { balance: 110, acquired: 121, consumed: 11 },
    'W.A': { balance: 200, acquired: 200, consumed: 0 }
};

async function run() {
  await client.connect();
  console.log("Analyzing Package Discrepancies (DB 5434)...\n");

  console.log("| Cliente | Dash Saldo | Dash Consumido | DB Ativo Consumido | Diff Consumo | Motivo Provável |");
  console.log("| :--- | :---: | :---: | :---: | :---: | :--- |");

  for (const [name, dash] of Object.entries(dashboardData)) {
    try {
        // Find Client
        const cRes = await client.query(`SELECT id FROM clients WHERE name ILIKE $1`, [`%${name}%`]);
        if (cRes.rows.length === 0) {
            console.log(`| ${name} | ? | ? | ? | ? | Client Not Found |`);
            continue;
        }
        const clientId = cRes.rows[0].id;

        // Get Consumptions
        // We separate into:
        // 1. Active (Confirmed + Concluida etc, excluding Cancelled)
        // 2. Cancelled
        // 3. 'Concluida' specifically (to check excludes)
        
        const consRes = await client.query(`
            SELECT 
                s.status,
                SUM(pc.quantity) as qty
            FROM package_consumptions pc
            JOIN sales s ON pc.sale_id = s.id
            JOIN client_packages cp ON pc.package_id = cp.id
            WHERE cp.client_id = $1
            GROUP BY s.status
        `, [clientId]);

        let dbActive = 0;
        let dbCancelled = 0;
        
        consRes.rows.forEach(r => {
            const q = Number(r.qty);
            if (r.status === 'cancelada') {
                dbCancelled += q;
            } else {
                dbActive += q;
            }
        });

        const diffConsumed = dbActive - dash.consumed;
        
        let reason = "OK";
        if (diffConsumed !== 0) {
            if (diffConsumed === 1000 && name === 'J3') reason = "1000 Consumos Fantasmas (Ignorados pelo Dash)";
            else if (Math.abs(diffConsumed) === dbCancelled) reason = "Vendas Canceladas Inclusas?"; // Unlikely if Diff is Active vs Dash
            else reason = `Consumo DB (${dbActive}) != Dash (${dash.consumed})`;
        }
        
        // Check Static Balance Discrepancy (New Sale Issue)
        // New Sale uses 'Table Available'.
        const pkgRes = await client.query(`SELECT available_quantity FROM client_packages WHERE client_id = $1`, [clientId]);
        const tableAvailable = Number(pkgRes.rows[0]?.available_quantity || 0);
        
        // Does Table Match New Logic?
        // New Logic = Initial - ActiveConsumed.
        // Dash = Initial - DashConsumed.
        // If DashConsumed != ActiveConsumed, there is a Dash Issue or Hidden Filter.
        
        console.log(`| ${name} | ${dash.balance} | ${dash.consumed} | ${dbActive} | ${diffConsumed} | ${reason} |`);

    } catch (e) {
        console.error(e);
    }
  }

  await client.end();
}

run();
