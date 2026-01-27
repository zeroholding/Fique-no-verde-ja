
const { Client } = require('pg');

// Trying to connect to the Live Production Port (5432) as specified in env/previous context
// Host: fck808wk44ww4kcggc0kcgk0 (Internal Coolify name) - likely not accessible externally.
// But user gave an IP for 5433: 72.61.62.227.
// Let's try 72.61.62.227:5432.
const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5432/postgres',
  connectionTimeoutMillis: 5000 // Short timeout
});

async function run() {
  console.log("Tentando conectar ao Banco de Dados de Produção (Porta 5432)...");
  try {
    await client.connect();
    console.log("Conectado com Sucesso!");
    
    const tmId = '4be828e2-86a2-4bc9-a909-e5212c809ef8'; // TM

    // 1. Get Static Balance
    const pkgRes = await client.query(`SELECT available_quantity, initial_quantity FROM client_packages WHERE client_id = $1`, [tmId]);
    console.log("Tabela Estática (Nova Venda):", pkgRes.rows[0]);

    // 2. Get Calculated Balance (Dashboard Logic)
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
          (cp.initial_quantity - COALESCE(irs.total_qty, 0)) + COALESCE(irs.total_qty, 0) as total_acquired_calc,
             -- Note above: The logic in statement splits them, but sum is Base + Reloads.
             -- Logic found earlier: Base = (Initial - Invis); Reloads = Invis; Sum = Initial.
             -- Wait... If Initial ALREADY HAS Invis?
             -- Let's just sum (Initial - Invis) + Invis = Initial.
             -- So if Initial is 1785, Total is 1785.
           (SELECT SUM(quantity) FROM package_consumptions pc JOIN client_packages cp2 ON pc.package_id = cp2.id WHERE cp2.client_id = cp.client_id) as total_consumed
        FROM client_packages cp
        LEFT JOIN invisible_reloads_sum irs ON cp.client_id = irs.client_id
        WHERE cp.client_id = $1
    `, [tmId]);
    
    const row = calcRes.rows[0];
    const balance = Number(row?.total_acquired_calc || 0) - Number(row?.total_consumed || 0);
    console.log("Saldo Calculado (Dashboard):", balance);

  } catch (e) {
    console.error("Falha ao conectar na porta 5432. O banco de dados de produção não está exposto para acesso externo direto.");
    console.error("Erro:", e.message);
  } finally {
    await client.end();
  }
}

run();
