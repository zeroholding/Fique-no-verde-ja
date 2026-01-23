const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function fixZombieConsumption() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== CORRIGINDO CONSUMO ZUMBI (J3) ===\n');
    
    // 1. Get the zombie consumption details
    const res = await client.query(`
      SELECT pc.id, pc.package_id, pc.quantity
      FROM package_consumptions pc
      JOIN sales s ON pc.sale_id = s.id
      WHERE pc.id = '478492f9-58b7-4844-b590-6bd3d5f8c9b1'
      AND s.status = 'cancelada'
    `);

    if (res.rows.length === 0) {
      console.log('Consumo zumbi já foi removido ou não encontrado.');
      return;
    }

    const { id, package_id, quantity } = res.rows[0];
    console.log(`Consumo encontrado: ${id}, Pacote: ${package_id}, Qtde: ${quantity}`);

    await client.query('BEGIN');

    // 2. Update client_packages
    await client.query(`
      UPDATE client_packages
      SET 
        consumed_quantity = consumed_quantity - $1,
        available_quantity = available_quantity + $1
      WHERE id = $2
    `, [quantity, package_id]);
    console.log('✅ Pacote atualizado (estornado consumo)');

    // 3. Delete consumption
    await client.query(`
      DELETE FROM package_consumptions WHERE id = $1
    `, [id]);
    console.log('✅ Consumo deletado');

    await client.query('COMMIT');
    console.log('\nCorreção aplicada com sucesso!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

fixZombieConsumption();
