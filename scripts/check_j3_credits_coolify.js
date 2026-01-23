const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function checkJ3Credits() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== CRÉDITOS DO CLIENTE J3 ===\n');
    
    const res = await client.query(`
      SELECT 
        c.name as client_name,
        s.name as service_name,
        cp.initial_quantity,
        cp.consumed_quantity,
        cp.available_quantity
      FROM client_packages cp
      JOIN clients c ON cp.client_id = c.id
      JOIN services s ON cp.service_id = s.id
      WHERE c.name ILIKE '%J3%' AND cp.is_active = true
    `);
    
    if (res.rows.length === 0) {
      console.log('Nenhum pacote ativo encontrado para cliente J3.');
    } else {
      res.rows.forEach(row => {
        console.log(`Cliente: ${row.client_name}`);
        console.log(`  Serviço: ${row.service_name}`);
        console.log(`  Disponíveis: ${row.available_quantity}`);
        console.log(`  Consumidos: ${row.consumed_quantity} de ${row.initial_quantity}\n`);
      });
    }
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

checkJ3Credits();
