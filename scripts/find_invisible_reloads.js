const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function findInvisibleReloads() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== BUSCANDO RECARGAS INVISÍVEIS ===\n');

    // 1. IDs de vendas que criaram pacotes
    const creationSales = await client.query('SELECT sale_id FROM client_packages');
    const visibleIds = new Set(creationSales.rows.map(r => r.sale_id));

    // 2. IDs de vendas Tipo 02 (Todas as compas de pacote/recargas)
    // Precisamos juntar com sale_items pra garantir que é Tipo 02, pois sales nao tem coluna sale_type direta em algumas versoes ou pode ser null
    // Mas o post save grava na tabela sales? Não, o endpoint lê do body.
    // O backend atualizado salva em sale_items.sale_type.
    
    const allPackageSales = await client.query(`
        SELECT DISTINCT s.id, s.sale_date, c.name, s.total
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        JOIN clients c ON s.client_id = c.id
        WHERE si.sale_type = '02'
        AND s.status != 'cancelada'
    `);

    let invisibleCount = 0;

    for (const sale of allPackageSales.rows) {
        if (!visibleIds.has(sale.id)) {
            console.log(`🕵️ RECARGA INVISÍVEL ENCONTRADA:`);
            console.log(`   Cliente: ${sale.name}`);
            console.log(`   Data: ${sale.sale_date}`);
            console.log(`   Valor: ${sale.total}`);
            console.log(`   ID: ${sale.id}`);
            console.log('   ---');
            invisibleCount++;
        }
    }

    console.log(`\nTotal de recargas invisíveis (agora visíveis com o fix): ${invisibleCount}`);

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

findInvisibleReloads();
