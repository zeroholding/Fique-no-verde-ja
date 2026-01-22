const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function checkData() {
  console.log('=== VERIFICANDO DADOS NO COOLIFY ===\n');
  
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('Conectado!\n');
    
    // Check services
    const services = await client.query('SELECT * FROM services');
    console.log(`Services: ${services.rows.length} registros`);
    services.rows.forEach(s => console.log(`  - ${s.id}: ${s.name}`));
    
    // Check products
    const products = await client.query('SELECT * FROM products');
    console.log(`\nProducts: ${products.rows.length} registros`);
    products.rows.forEach(p => console.log(`  - ${p.id}: ${p.name}`));
    
    // Check users
    const users = await client.query('SELECT id, first_name, last_name, is_admin FROM users LIMIT 5');
    console.log(`\nUsers (primeiros 5): ${users.rows.length} registros`);
    users.rows.forEach(u => console.log(`  - ${u.id}: ${u.first_name} ${u.last_name} (admin: ${u.is_admin})`));
    
    // Check clients count
    const clients = await client.query('SELECT COUNT(*) as count FROM clients');
    console.log(`\nClients: ${clients.rows[0].count} registros`);
    
    // Check sales count
    const sales = await client.query('SELECT COUNT(*) as count FROM sales');
    console.log(`Sales: ${sales.rows[0].count} registros`);
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

checkData();
