const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function investigateOrphanSales() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== ANÁLISE DETALHADA: VENDAS ÓRFÃS ===\n');

    // Buscar vendas órfãs com detalhes completos
    const orphans = await client.query(`
      SELECT 
        s.id AS sale_id,
        TO_CHAR(s.sale_date, 'YYYY-MM-DD HH24:MI') AS data,
        s.status,
        s.observations,
        c.name AS cliente_final,
        si.product_name,
        si.quantity AS qty_item,
        si.total AS item_total
      FROM sales s
      JOIN clients c ON s.client_id = c.id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN package_consumptions pc ON pc.sale_id = s.id
      WHERE s.observations LIKE '%[PCT:%'
        AND pc.id IS NULL
      ORDER BY s.sale_date DESC
    `);

    console.log(`Encontradas ${orphans.rows.length} vendas órfãs:\n`);

    // Agrupar por status
    const confirmadas = orphans.rows.filter(r => r.status === 'confirmada');
    const canceladas = orphans.rows.filter(r => r.status === 'cancelada');

    console.log('--- CONFIRMADAS (precisam de consumo OU remoção da tag) ---\n');
    for (const r of confirmadas) {
      // Extrair transportadora da observação
      const match = r.observations.match(/\[PCT:\s*([^\]]+)\]/);
      const transportadora = match ? match[1].trim() : 'DESCONHECIDA';
      
      console.log(`[${r.status}] ${r.data} | ${r.cliente_final}`);
      console.log(`    Transportadora: ${transportadora}`);
      console.log(`    Produto: ${r.product_name}`);
      console.log(`    Quantidade: ${r.qty_item}`);
      console.log(`    Sale ID: ${r.sale_id}`);
      console.log('');
    }

    console.log('\n--- CANCELADAS (apenas limpeza, não precisam de ação) ---\n');
    for (const r of canceladas) {
      const match = r.observations.match(/\[PCT:\s*([^\]]+)\]/);
      const transportadora = match ? match[1].trim() : 'DESCONHECIDA';
      
      console.log(`[${r.status}] ${r.data} | ${r.cliente_final}`);
      console.log(`    Transportadora: ${transportadora}`);
      console.log(`    Sale ID: ${r.sale_id}`);
      console.log('');
    }

    console.log('\n--- RESUMO ---');
    console.log(`Total: ${orphans.rows.length}`);
    console.log(`Confirmadas (precisam ação): ${confirmadas.length}`);
    console.log(`Canceladas (sem ação): ${canceladas.length}`);

    // Calcular impacto por transportadora
    console.log('\n--- IMPACTO POR TRANSPORTADORA (vendas confirmadas) ---\n');
    const impacto = {};
    for (const r of confirmadas) {
      const match = r.observations.match(/\[PCT:\s*([^\]]+)\]/);
      const transportadora = match ? match[1].trim() : 'DESCONHECIDA';
      if (!impacto[transportadora]) impacto[transportadora] = 0;
      impacto[transportadora] += Number(r.qty_item || 0);
    }
    
    for (const [t, qty] of Object.entries(impacto)) {
      console.log(`  ${t}: ${qty} unidades deveriam ter sido consumidas`);
    }

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

investigateOrphanSales();
