const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function checkCreationSaleTypes() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== VERIFICAÇÃO TIPO DE VENDA (CRIAÇÃO DE PACOTES) ===\n');

    const packages = await client.query(`
      SELECT 
        c.name AS client,
        cp.id AS package_id,
        cp.initial_quantity,
        cp.sale_id AS creation_sale_id
      FROM client_packages cp
      JOIN clients c ON cp.client_id = c.id
      WHERE UPPER(c.name) IN ('TM', 'J3', 'FLASH')
    `);

    for (const pkg of packages.rows) {
        console.log(`Cliente: ${pkg.client}`);
        console.log(`  Pkg Init Qty: ${pkg.initial_quantity}`);
        console.log(`  Creation Sale ID: ${pkg.creation_sale_id}`);

        // Buscar itens dessa venda
        const items = await client.query(`
            SELECT product_name, quantity, sale_type 
            FROM sale_items 
            WHERE sale_id = $1
        `, [pkg.creation_sale_id]);

        if (items.rows.length === 0) {
            console.log(`  ⚠️ NENHUM ITEM encontrado para esta venda!`);
        } else {
            for (const item of items.rows) {
                console.log(`    Item: ${item.product_name} | Qty: ${item.quantity} | Type: '${item.sale_type}'`);
                if (item.sale_type !== '02') {
                    console.log(`    🚨 ALERTA: Tipo não é '02'! Se a API filtra por '02', esta venda sumiu.`);
                }
            }
        }
        console.log('');
    }

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

checkCreationSaleTypes();
