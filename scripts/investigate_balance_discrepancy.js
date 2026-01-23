const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function investigateBalanceDiscrepancy() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== INVESTIGAÇÃO: DIVERGÊNCIA DE SALDO ===\n');

    // 1. Listar todas as transportadoras e seus saldos atuais
    console.log('--- 1. SALDOS POR TRANSPORTADORA (client_packages) ---\n');
    const packagesRes = await client.query(`
      SELECT 
        c.name AS transportadora,
        cp.id AS package_id,
        s.name AS servico,
        cp.initial_quantity AS init,
        cp.consumed_quantity AS consumed,
        cp.available_quantity AS available,
        cp.is_active AS active
      FROM client_packages cp
      JOIN clients c ON cp.client_id = c.id
      LEFT JOIN services s ON cp.service_id = s.id
      WHERE c.client_type = 'package'
      ORDER BY c.name, s.name
    `);
    
    for (const r of packagesRes.rows) {
      const status = r.active ? 'ATIVO' : 'INATIVO';
      console.log(`[${status}] ${r.transportadora} | ${r.servico || 'N/A'}`);
      console.log(`    init: ${r.init}, consumed: ${r.consumed}, available: ${r.available}`);
      console.log(`    ID: ${r.package_id}\n`);
    }

    // 2. Saldo calculado a partir de consumos (package_consumptions)
    console.log('\n--- 2. COMPARAÇÃO: consumed_quantity vs SUM(consumptions) ---\n');
    const consumptionsRes = await client.query(`
      SELECT 
        cp.id AS package_id,
        c.name AS transportadora,
        cp.consumed_quantity AS consumed_no_pacote,
        COALESCE(SUM(pc.quantity), 0)::int AS sum_consumptions
      FROM client_packages cp
      JOIN clients c ON cp.client_id = c.id
      LEFT JOIN package_consumptions pc ON pc.package_id = cp.id
      WHERE c.client_type = 'package'
      GROUP BY cp.id, c.name, cp.consumed_quantity
      ORDER BY c.name
    `);
    
    for (const r of consumptionsRes.rows) {
      const diff = Number(r.consumed_no_pacote) - Number(r.sum_consumptions);
      const match = diff === 0 ? '✅' : `⚠️ DIFF: ${diff}`;
      console.log(`${match} ${r.transportadora}`);
      console.log(`    consumed_no_pacote: ${r.consumed_no_pacote}`);
      console.log(`    SUM(consumptions): ${r.sum_consumptions}\n`);
    }

    // 3. Comparação: available vs (initial - consumed)
    console.log('\n--- 3. COMPARAÇÃO: available vs (initial - consumed) ---\n');
    const availRes = await client.query(`
      SELECT 
        c.name AS transportadora,
        cp.id AS package_id,
        cp.initial_quantity AS init,
        cp.consumed_quantity AS consumed,
        cp.available_quantity AS available
      FROM client_packages cp
      JOIN clients c ON cp.client_id = c.id
      WHERE c.client_type = 'package'
      ORDER BY c.name
    `);
    
    for (const r of availRes.rows) {
      const calculado = Number(r.init) - Number(r.consumed);
      const diff = Number(r.available) - calculado;
      const match = diff === 0 ? '✅' : `⚠️ DIFF: ${diff}`;
      console.log(`${match} ${r.transportadora}`);
      console.log(`    available: ${r.available}`);
      console.log(`    calculado (init-consumed): ${calculado}\n`);
    }

    // 4. Vendas Órfãs
    console.log('\n--- 4. VENDAS [PCT:...] SEM package_consumptions ---\n');
    const orphanRes = await client.query(`
      SELECT 
        s.id AS sale_id,
        TO_CHAR(s.sale_date, 'YYYY-MM-DD HH24:MI') AS data,
        s.status,
        LEFT(s.observations, 50) AS obs,
        c.name AS cliente_final
      FROM sales s
      JOIN clients c ON s.client_id = c.id
      LEFT JOIN package_consumptions pc ON pc.sale_id = s.id
      WHERE s.observations LIKE '%[PCT:%'
        AND pc.id IS NULL
      ORDER BY s.sale_date DESC
      LIMIT 10
    `);
    
    if (orphanRes.rows.length > 0) {
      console.log("⚠️ VENDAS ÓRFÃS (marcadas como pacote mas sem consumo):\n");
      for (const r of orphanRes.rows) {
        console.log(`[${r.status}] ${r.data} | ${r.cliente_final}`);
        console.log(`    Obs: ${r.obs}...`);
        console.log(`    ID: ${r.sale_id}\n`);
      }
    } else {
      console.log("✅ Nenhuma venda órfã encontrada.");
    }

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

investigateBalanceDiscrepancy();
