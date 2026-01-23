const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function checkCancelledConsumptions() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== CONSUMOS EM VENDAS CANCELADAS (J3) ===\n');
    
    // Check for consumptions linked to cancelled sales
    const res = await client.query(`
      SELECT 
        pc.id,
        pc.quantity,
        pc.consumed_at,
        s.id as sale_id,
        s.status as sale_status,
        s.sale_number,
        c.name as client_name
      FROM package_consumptions pc
      JOIN client_packages cp ON pc.package_id = cp.id
      JOIN clients c ON cp.client_id = c.id
      JOIN sales s ON pc.sale_id = s.id
      WHERE c.name ILIKE '%J3%' 
      AND s.status = 'cancelada'
    `);
    
    if (res.rows.length === 0) {
      console.log('Nenhum consumo em venda cancelada encontrado.');
    } else {
      res.rows.forEach(row => {
        console.log(`Consumo ID: ${row.id}`);
        console.log(`  Qtde: ${row.quantity}`);
        console.log(`  Data: ${row.consumed_at}`);
        console.log(`  Venda: ${row.sale_number} (Status: ${row.sale_status})\n`);
      });
    }

    // Check query used by Public Statement (no status filter)
    const resPublic = await client.query(`
      SELECT SUM(pc.quantity) as total_consumed
      FROM package_consumptions pc
      JOIN client_packages cp ON pc.package_id = cp.id
      JOIN clients c ON cp.client_id = c.id
      JOIN sales s ON pc.sale_id = s.id
      WHERE c.name ILIKE '%J3%'
      -- NO STATUS FILTER
    `);
    console.log(`Total Consumido (Public/Sem Filtro): ${resPublic.rows[0].total_consumed}`);

    // Check query used by Dashboard (with status filter)
    const resDash = await client.query(`
      SELECT SUM(pc.quantity) as total_consumed
      FROM package_consumptions pc
      JOIN client_packages cp ON pc.package_id = cp.id
      JOIN clients c ON cp.client_id = c.id
      JOIN sales s ON pc.sale_id = s.id
      WHERE c.name ILIKE '%J3%'
      AND s.status != 'cancelada'
    `);
    console.log(`Total Consumido (Dashboard/Com Filtro): ${resDash.rows[0].total_consumed}`);
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

checkCancelledConsumptions();
