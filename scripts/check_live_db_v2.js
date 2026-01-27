
const { Client } = require('pg');

// Trying to connect to Live Production via newly mapped Port 5434
const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
  connectionTimeoutMillis: 5000 // Short timeout
});

async function run() {
  console.log("Tentando conectar ao Banco de Dados de Produção (Porta 5434)...");
  try {
    await client.connect();
    console.log("Conectado com Sucesso!");
    
    const tmId = '4be828e2-86a2-4bc9-a909-e5212c809ef8'; // TM

    // 1. Get Static Balance from Table
    const pkgRes = await client.query(`SELECT available_quantity, initial_quantity FROM client_packages WHERE client_id = $1`, [tmId]);
    const staticRow = pkgRes.rows[0];

    // 2. Get Calculated Balance (Dashboard Logic simulation)
    const calcRes = await client.query(`
        WITH invisible_reloads_sum AS (
            SELECT 
                s.client_id, 
                SUM(si.quantity) as total_qty
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            WHERE si.sale_type = '02' 
            AND s.status != 'cancelada'
            AND s.client_id = $1
            AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE sale_id IS NOT NULL)
            GROUP BY s.client_id
        )
        SELECT
          cp.initial_quantity as base_initial,
          COALESCE(irs.total_qty, 0) as reloads,
           (SELECT SUM(quantity) FROM package_consumptions pc JOIN client_packages cp2 ON pc.package_id = cp2.id WHERE cp2.client_id = cp.client_id) as total_consumed
        FROM client_packages cp
        LEFT JOIN invisible_reloads_sum irs ON cp.client_id = irs.client_id
        WHERE cp.client_id = $1
    `, [tmId]);
    
    const row = calcRes.rows[0];
    const initial = Number(row?.base_initial || 0);
    const reloads = Number(row?.reloads || 0);
    const consumed = Number(row?.total_consumed || 0);
    
    // Logic: (Base - Reloads) + Reloads - Consumed = Base - Consumed?
    // Let's assume the Dashboard Logic is: Balance = (Initial - Invis) + Invis - Consumed = Initial - Consumed.
    // Wait... If Initial ALREADY CONTAINS reloads?
    // We will check: does Initial == 1785?
    
    const calculatedBalance = initial - consumed; // Assuming Initial contains Everything.
    
    console.log("\n### DADOS REAIS DE PRODUÇÃO ###");
    console.log("\n1. Tabela Estática (Nova Venda):");
    console.log(`   - Initial Quantity: ${staticRow?.initial_quantity}`);
    console.log(`   - Available Quantity (O que a tela mostra): ${staticRow?.available_quantity}`);

    console.log("\n2. Cálculo Dinâmico (Dashboard):");
    console.log(`   - Base Inicial: ${initial}`);
    console.log(`   - Recargas Invisíveis: +${reloads}`);
    console.log(`   - Total Consumido: -${consumed}`);
    console.log(`   - Saldo Calculado (Base + Recargas?): ${initial + reloads - consumed} (Se Base nao tiver recargas)`);
    console.log(`   - Saldo Calculado (Simples): ${initial - consumed} (Se Base ja tiver recargas incluídas na origem)`);

    console.log("\nVerificação:");
    console.log(`   - O usuário vê 269 no Dashboard.`);
    
  } catch (e) {
    console.error("Falha ao conectar na porta 5434.");
    console.error("Erro:", e.message);
  } finally {
    await client.end();
  }
}

run();
