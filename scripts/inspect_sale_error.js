const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function inspectSaleAndSchema() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== INSPEÇÃO DE VENDA E SCHEMA ===\n');
    
    // 1. Check schema for package_consumptions.sale_id
    console.log('--- Schema: package_consumptions.sale_id ---');
    const schemaRes = await client.query(`
      SELECT 
        table_name, 
        column_name, 
        is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'package_consumptions' AND column_name = 'sale_id'
    `);
    console.log(schemaRes.rows[0]);

    // 2. Check FK constraint details
    console.log('\n--- FK Constraint ---');
    const fkRes = await client.query(`
      SELECT
        tc.constraint_name,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc 
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.table_name = 'package_consumptions' 
      AND tc.constraint_type = 'FOREIGN KEY'
    `);
    fkRes.rows.forEach(r => console.log(`${r.constraint_name}: ON DELETE ${r.delete_rule}`));

    // 3. Inspect the specific sale
    console.log('\n--- Venda fa43ed20... ---');
    const saleId = 'fa43ed20-4388-40bb-abeb-1c3e03bf3be4';
    const saleRes = await client.query(`SELECT id, sale_number, status, sale_date FROM sales WHERE id = $1`, [saleId]);
    console.log('Venda:', saleRes.rows[0]);

    // 4. Inspect linked consumptions
    console.log('\n--- Consumos vinculados ---');
    const consRes = await client.query(`SELECT id, package_id, quantity FROM package_consumptions WHERE sale_id = $1`, [saleId]);
    console.log(consRes.rows);

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

inspectSaleAndSchema();
