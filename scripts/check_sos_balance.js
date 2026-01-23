const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function checkSOS() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== VERIFICAÇÃO SOS E LVM ===\n');

    const clients = ['SOS', 'LVM'];
    
    for (const name of clients) {
        // 1. Check Package Table
        const pkgRes = await client.query(`
            SELECT c.name, cp.id, cp.initial_quantity, cp.consumed_quantity, cp.available_quantity
            FROM client_packages cp
            JOIN clients c ON cp.client_id = c.id
            WHERE UPPER(c.name) = $1
        `, [name]);
        
        const pkg = pkgRes.rows[0];
        console.log(`CLIENTE: ${name}`);
        console.log(`  [DB Package] Init: ${pkg?.initial_quantity}, Cons: ${pkg?.consumed_quantity}, Avail: ${pkg?.available_quantity}`);

        // 2. Check Invisible Reloads (Type 02 not linked)
        const reloads = await client.query(`
            SELECT s.id, s.sale_date, s.total, si.quantity
            FROM sales s
            JOIN sale_items si ON si.sale_id = s.id
            JOIN clients c ON s.client_id = c.id
            WHERE UPPER(c.name) = $1
            AND si.sale_type = '02'
            AND s.id NOT IN (SELECT sale_id FROM client_packages)
            AND s.status != 'cancelada'
        `, [name]);

        let invisibleQty = 0;
        if (reloads.rows.length > 0) {
            console.log(`  [Invisible Reloads] Encontradas ${reloads.rows.length}:`);
            for (const r of reloads.rows) {
                console.log(`    - Data: ${r.sale_date} | Qty: ${r.quantity} | Total: ${r.total}`);
                invisibleQty += Number(r.quantity);
            }
        } else {
            console.log(`  [Invisible Reloads] Nenhuma encontrada.`);
        }

        const totalCalculated = Number(pkg?.available_quantity || 0) + invisibleQty;
        console.log(`  >> SALDO TOTAL ESTIMADO (Dashboard): ${totalCalculated}\n`);
    }

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

checkSOS();
