
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres',
});

async function run() {
  await client.connect();
  const tmId = '4be828e2-86a2-4bc9-a909-e5212c809ef8';
  
  try {
    console.log(`Checking Balance for TM (${tmId})...`);

    // 1. Initial Package Quantity
    const pkgRes = await client.query(`SELECT initial_quantity, available_quantity FROM client_packages WHERE client_id = $1`, [tmId]);
    const initial = Number(pkgRes.rows[0]?.initial_quantity || 0);
    const staticAvailable = Number(pkgRes.rows[0]?.available_quantity || 0);

    // 2. Invisible Reloads (Type 02 Sales NOT in client_packages)
    const reloadRes = await client.query(`
        SELECT s.id, s.sale_date, si.quantity, si.product_name
        FROM sales s
        JOIN sale_items si ON s.id = si.sale_id
        WHERE si.sale_type = '02' 
        AND s.status != 'cancelada'
        AND s.client_id = $1
        AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE sale_id IS NOT NULL)
    `, [tmId]);
    
    let reloadsTotal = 0;
    console.log("\n--- Recargas Invisíveis (Somam ao Saldo) ---");
    reloadRes.rows.forEach(r => {
        console.log(`+ ${r.quantity} (${r.sale_date}) - ${r.product_name}`);
        reloadsTotal += Number(r.quantity);
    });
    
    // 3. Consumptions
    const consRes = await client.query(`
        SELECT pc.quantity, pc.consumed_at
        FROM package_consumptions pc
        JOIN client_packages cp ON pc.package_id = cp.id
        WHERE cp.client_id = $1
    `, [tmId]);
    
    let consumedTotal = 0;
    // console.log("\n--- Consumos (Subtraem do Saldo) ---");
    consRes.rows.forEach(r => {
        consumedTotal += Number(r.quantity);
    });

    const calculatedBalance = initial + reloadsTotal - consumedTotal;

    console.log(`\n--- RESUMO ---`);
    console.log(`Inicial (Pacote Base): ${initial}`);
    console.log(`Recargas (Invisíveis): +${reloadsTotal}`);
    console.log(`Consumido Total:       -${consumedTotal}`);
    console.log(`------------------------------`);
    console.log(`Saldo Calculado (DB):   ${calculatedBalance}`);
    console.log(`Saldo Tabela Estática:  ${staticAvailable}`);
    console.log(`User Diz que é:         269`);
    console.log(`Diferença (User - DB):  ${269 - calculatedBalance}`);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
