
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres',
});

async function run() {
  await client.connect();
  try {
    const tmId = '4be828e2-86a2-4bc9-a909-e5212c809ef8';

    // 1. Get Static Balance (Used in Dashboard Sales / New Sale)
    const staticRes = await client.query(`
      SELECT available_quantity 
      FROM client_packages 
      WHERE client_id = $1
    `, [tmId]);
    const staticQty = staticRes.rows[0]?.available_quantity || 0;

    // 2. Get Calculated Balance (Used in Dashboard Packages)
    // Legacy Base + Reloads - All Consumptions
    // Note: We replicate the logic from statement/route.ts
    // Base = Initial (from package) - Invisible Reloads (calculated sum)
    // Plus: Invisible Reloads (Separate Lines)
    // Minus: Consumptions
    // Net Result = Initial - Consumptions ??
    // Let's use the query logic exactly.
    
    // Step A: Calculate Invisible Reloads
    const invisRes = await client.query(`
            SELECT SUM(si.quantity) as total_qty
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            WHERE si.sale_type = '02' 
            AND s.status != 'cancelada'
            AND s.client_id = $1
            AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE sale_id IS NOT NULL)
    `, [tmId]);
    const invisibleQty = Number(invisRes.rows[0]?.total_qty || 0);

    // Step B: Get Base Package Initial
    const pkgRes = await client.query(`
        SELECT initial_quantity FROM client_packages WHERE client_id = $1
    `, [tmId]);
    const initialQty = Number(pkgRes.rows[0]?.initial_quantity || 0);

    // Step C: Get Total Consumed (All time)
    // Note: The dashboard sums all consumptions.
    const consRes = await client.query(`
        SELECT SUM(quantity) as total_consumed
        FROM package_consumptions pc
        JOIN client_packages cp ON pc.package_id = cp.id
        WHERE cp.client_id = $1
    `, [tmId]);
    const totalConsumed = Number(consRes.rows[0]?.total_consumed || 0);

    // Dashboard Calculation:
    // (Initial - Invisible) + Invisible - Consumed = Initial - Consumed?
    // Wait, the query does:
    // Row 1 (Base): Initial - Invisible
    // Row 2..N (Reloads): Invisible Items
    // Row N+1 (Consumptions): -Consumed
    // Sum = (Initial - Invisible) + Invisible - Consumed = Initial - Consumed.
    const calculatedQty = initialQty - totalConsumed; // Logic simplification holds true if query is correct.
    
    // But wait, the previous execution showed:
    // Calculated: 210. (1785 - 1575)
    // Static: 167.
    // Why? 
    // Initial (1785) vs Static Initial (1785). Match.
    // Consumed (1575) vs Static Consumed (1618)?
    // Let's fetch pure static `consumed_quantity` from table too.
    const staticConsumedRes = await client.query(`
      SELECT consumed_quantity FROM client_packages WHERE client_id = $1
    `, [tmId]);
    const staticConsumed = Number(staticConsumedRes.rows[0]?.consumed_quantity || 0);

    console.log(`\n### Relatório de Divergência: Cliente TM (ID ${tmId})`);
    console.log(`\n| Dados | Dashboard Packages (Calculado) | Dashboard Sales (Estático/Banco) | Diferença |`);
    console.log(`| :--- | :---: | :---: | :---: |`);
    console.log(`| **Total Adquirido (Entradas)** | ${initialQty} | ${initialQty} | 0 |`);
    console.log(`| **Total Consumido (Saídas)** | ${totalConsumed} | ${staticConsumed} | ${totalConsumed - staticConsumed} (Erro) |`);
    console.log(`| **SALDO FINAL (Disponível)** | **${initialQty - totalConsumed}** | **${staticQty}** | **${(initialQty - totalConsumed) - staticQty}** |`);
    
    console.log(`\n**Analise:**`);
    console.log(`- **Dashboard Packages:** Olha para o historico real de consumos (${totalConsumed}).`);
    console.log(`- **Dashboard Sales (Novo):** Olha para o campo 'available_quantity' (${staticQty}) gravado na tabela, que esta desatualizado.`);
    console.log(`- A coluna 'consumed_quantity' na tabela tambem esta incorreta (${staticConsumed} vs ${totalConsumed} reais).`);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
