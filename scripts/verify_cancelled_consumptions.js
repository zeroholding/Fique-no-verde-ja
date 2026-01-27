
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
});

async function run() {
  await client.connect();
  const tmId = '4be828e2-86a2-4bc9-a909-e5212c809ef8';

  try {
    console.log("Checking for Consumptions linked to Cancelled Sales (Prod 5434)...");
    
    // 1. Total Consumptions in Table
    const tableRes = await client.query(`SELECT consumed_quantity FROM client_packages WHERE client_id = $1`, [tmId]);
    console.log(`Table Consumed Quantity: ${tableRes.rows[0]?.consumed_quantity}`);

    // 2. Total active Consumptions (Query)
    const activeRes = await client.query(`
        SELECT SUM(pc.quantity) as val
        FROM package_consumptions pc
        JOIN sales s ON pc.sale_id = s.id
        JOIN client_packages cp ON pc.package_id = cp.id
        WHERE cp.client_id = $1
        AND s.status != 'cancelada'
    `, [tmId]);
    const activeConsumed = Number(activeRes.rows[0]?.val || 0);
    console.log(`Active Consumed (Status != cancelada): ${activeConsumed}`);

    // 3. Cancelled Consumptions
    const cancelRes = await client.query(`
        SELECT SUM(pc.quantity) as val
        FROM package_consumptions pc
        JOIN sales s ON pc.sale_id = s.id
        JOIN client_packages cp ON pc.package_id = cp.id
        WHERE cp.client_id = $1
        AND s.status = 'cancelada'
    `, [tmId]);
    const cancelledConsumed = Number(cancelRes.rows[0]?.val || 0);
    console.log(`Cancelled Consumed (Status == cancelada): ${cancelledConsumed}`);

    console.log("-----------------------");
    console.log(`Table - Active = ${tableRes.rows[0]?.consumed_quantity - activeConsumed}`);
    
    // Calculate final predicted balance on Dashboard
    // Dashboard = Initial (1785) - ActiveConsumed
    const initial = 1785;
    console.log(`Predicted Dashboard Balance: ${initial} - ${activeConsumed} = ${initial - activeConsumed}`);
    console.log(`User sees: 269`);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
