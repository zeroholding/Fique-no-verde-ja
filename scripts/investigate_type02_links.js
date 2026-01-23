const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function investigateType02Links() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== ANÁLISE: LINK DE VENDAS TIPO 02 ===\n');

    // 1. Buscar pacotes ativos e ver a qual sale_id eles estão ligados
    const packages = await client.query(`
      SELECT 
        cp.id AS package_id,
        c.name AS client_name,
        cp.initial_quantity,
        cp.available_quantity,
        cp.updated_at,
        cp.sale_id AS package_sale_id_fk,
        s.sale_date AS creation_date
      FROM client_packages cp
      JOIN clients c ON cp.client_id = c.id
      JOIN sales s ON cp.sale_id = s.id
      WHERE cp.is_active = true
      ORDER BY cp.updated_at DESC
      LIMIT 10
    `);

    console.log('--- PACOTES ATIVOS E SEUS SALE_IDs (CRIAÇÃO) ---');
    for (const pkg of packages.rows) {
      console.log(`[${pkg.client_name}] PkgID: ${pkg.package_id}`);
      console.log(`    SaleFK: ${pkg.package_sale_id_fk} (${pkg.creation_date})`);
      console.log(`    Saldo: ${pkg.available_quantity}/${pkg.initial_quantity}`);
      console.log(`    Última Atualização: ${pkg.updated_at}`);
      console.log('');
    }

    // 2. Buscar vendas Tipo 02 (Reloads) que NÃO estão linkadas a nenhum pacote via FK direta
    //    Mas que deveriam estar no histórico (se existisse tabela de log)
    //    Como sabemos que são reloads? Pela query de itens
    
    console.log('--- VENDAS TIPO 02 RECENTES (RELOADS POTENCIAIS) ---');
    
    const reloads = await client.query(`
        SELECT 
            s.id AS sale_id,
            s.sale_date,
            c.name AS client_name,
            si.product_name,
            si.quantity,
            si.sale_type
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        JOIN clients c ON s.client_id = c.id
        WHERE si.sale_type = '02'
        ORDER BY s.sale_date DESC
        LIMIT 10
    `);

    for (const r of reloads.rows) {
        console.log(`[${r.client_name}] SaleID: ${r.sale_id} (${r.sale_date})`);
        console.log(`    Item: ${r.product_name} (Qty: ${r.quantity})`);
        
        // Verificar se essa sale_id está em client_packages
        const check = await client.query(`SELECT id FROM client_packages WHERE sale_id = $1`, [r.sale_id]);
        if (check.rowCount > 0) {
            console.log(`    ✅ Linkada em client_packages (PK: ${check.rows[0].id}) -> Aparece no extrato`);
        } else {
            console.log(`    ❌ NÃO linkada em client_packages -> NÃO aparece no extrato (Reload invisível)`);
        }
        console.log('');
    }

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

investigateType02Links();
