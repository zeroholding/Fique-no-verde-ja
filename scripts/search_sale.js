const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function searchSale() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('Buscando vendas de "Morais" em 21/01/2026...\n');
    
    const res = await client.query(`
      SELECT s.id, s.sale_date, s.total, s.status, c.name 
      FROM sales s 
      JOIN clients c ON s.client_id = c.id 
      WHERE c.name ILIKE '%morais%' 
        AND s.sale_date >= '2026-01-21'
      ORDER BY s.sale_date DESC
    `);
    
    console.log('Vendas encontradas:', res.rows.length);
    if (res.rows.length > 0) {
      res.rows.forEach(r => {
        console.log(`  - ID: ${r.id}`);
        console.log(`    Cliente: ${r.name}`);
        console.log(`    Data: ${r.sale_date}`);
        console.log(`    Total: R$ ${r.total}`);
        console.log(`    Status: ${r.status}\n`);
      });
    } else {
      console.log('Nenhuma venda encontrada para este cliente hoje.');
    }
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

searchSale();
