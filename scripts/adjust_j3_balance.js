
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres',
});

async function adjustJ3() {
  await client.connect();
  console.log("Connected to VPS (Port 5433)...");

  try {
    const TARGET_BALANCE = 536;
    const clientName = 'J3';

    // 1. Get Client ID
    const resClient = await client.query("SELECT id FROM clients WHERE name = $1", [clientName]);
    if (resClient.rows.length === 0) {
        console.log(`Client ${clientName} not found.`);
        return;
    }
    const clientId = resClient.rows[0].id;

    // 2. Calculate Current Balance (Logic from Verification Script)
    
    // Legacy
    const resPackages = await client.query(`SELECT SUM(initial_quantity) as val FROM client_packages WHERE client_id = $1`, [clientId]);
    const legacy = Number(resPackages.rows[0].val || 0);

    // Reloads (Invisible Type 02)
    const resReloads = await client.query(`
        SELECT SUM(si.quantity) as val
        FROM sales s
        JOIN sale_items si ON s.id = si.sale_id
        WHERE s.client_id = $1
        AND si.sale_type = '02'
        AND s.status != 'cancelada'
        AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE client_id = $1 AND sale_id IS NOT NULL)
    `, [clientId]);
    const reloads = Number(resReloads.rows[0].val || 0);

    // Consumed
    const resConsumed = await client.query(`
        SELECT SUM(quantity) as val
        FROM package_consumptions pc
        JOIN client_packages cp ON pc.package_id = cp.id
        WHERE cp.client_id = $1
    `, [clientId]);
    const consumed = Number(resConsumed.rows[0].val || 0);

    const currentBalance = legacy + reloads - consumed;
    console.log(`Current J3 Balance: ${currentBalance}`);
    console.log(`Target: ${TARGET_BALANCE}`);

    if (currentBalance === TARGET_BALANCE) {
        console.log("Balance is already correct.");
        return;
    }

    const adjustmentNeeded = currentBalance - TARGET_BALANCE;
    console.log(`Adjustment Needed (Consume): ${adjustmentNeeded}`);

    if (adjustmentNeeded < 0) {
        console.log("WARNING: Current balance is LESS than target. Would need negative consumption (refund). Assuming positive consumption request.");
        // If we needed to ADD balance, we'd add negative consumption or a new package.
        // User asked to "leave it at 536", implied reduction from 1494.
    }

    // 3. Apply Adjustment
    
    // Find latest package
    const packageRes = await client.query(`SELECT id FROM client_packages WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1`, [clientId]);
    if (packageRes.rows.length === 0) { console.error("No package found"); return; }
    const packageId = packageRes.rows[0].id;

    // Create a dummy sale for the adjustment
    const saleRes = await client.query(`
        INSERT INTO sales (client_id, total, status, created_at)
        VALUES ($1, 0, 'concluida', NOW())
        RETURNING id
    `, [clientId]);
    const saleId = saleRes.rows[0].id;
    console.log(`Created adjustment sale: ${saleId}`);

    // Insert Consumption
    await client.query(`
        INSERT INTO package_consumptions (package_id, quantity, consumed_at, total_value, unit_price, sale_id)
        VALUES ($1, $2, NOW(), 0, 0, $3)
    `, [packageId, adjustmentNeeded, saleId]);

    // Update Package
    await client.query(`
        UPDATE client_packages
        SET consumed_quantity = consumed_quantity + $1,
            available_quantity = available_quantity - $1
        WHERE id = $2
    `, [adjustmentNeeded, packageId]);

    console.log(`✅ Adjusted J3 balance. Consumed ${adjustmentNeeded} credits.`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

adjustJ3();
