const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function checkRecentSales() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== VENDAS RECENTES NO COOLIFY ===\n');
    
    // Check most recent sales
    const res = await client.query(`
      SELECT s.id, s.client_id, s.sale_date, s.total, s.status, s.created_at, c.name as client_name
      FROM sales s 
      LEFT JOIN clients c ON s.client_id = c.id 
      ORDER BY s.created_at DESC 
      LIMIT 10
    `);
    
    console.log('Últimas 10 vendas:');
    res.rows.forEach((r, i) => {
      console.log(`${i+1}. ${r.client_name || 'N/A'} - R$ ${r.total} - ${r.status} - ${r.created_at}`);
    });
    
    // Check for today
    const todayRes = await client.query(`
      SELECT COUNT(*) as count FROM sales 
      WHERE created_at >= '2026-01-21'
    `);
    console.log('\nVendas criadas hoje (21/01):', todayRes.rows[0].count);
    
    // Check specific client
    const clientRes = await client.query(`
      SELECT id, name FROM clients 
      WHERE id = '0b788c39-c305-4bd9-a823-951032d2733c'
    `);
    console.log('\nCliente 0b788c39...:', clientRes.rows[0]?.name || 'NÃO ENCONTRADO');
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

checkRecentSales();
