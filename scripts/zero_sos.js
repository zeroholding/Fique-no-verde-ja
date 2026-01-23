const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function zeroSOS() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== ZERANDO SALDO SOS (CONSUMINDO 63 CREDITOS) [FIXED] ===\n');

    const pkgRes = await client.query(`
        SELECT cp.id, cp.available_quantity, c.id as client_id, cp.unit_price
        FROM client_packages cp
        JOIN clients c ON cp.client_id = c.id
        WHERE UPPER(c.name) = 'SOS'
    `);
    
    if (pkgRes.rows.length === 0) {
        console.log('Pacote SOS não encontrado.');
        return;
    }
    
    const pkg = pkgRes.rows[0];
    const qtyToConsume = 63;
    const unitPrice = parseFloat(pkg.unit_price) || 10;
    const totalVal = qtyToConsume * unitPrice;
    
    console.log(`Pacote atual (DB): Avail=${pkg.available_quantity}. Vamos consumir ${qtyToConsume}.`);

    await client.query('BEGIN');

    const saleId = uuidv4();
    // Inserir Venda (subtotal = tal, total = tal)
    await client.query(`
        INSERT INTO sales (id, client_id, sale_date, observations, payment_method, status, subtotal, total_discount, total, created_at, updated_at)
        VALUES ($1, $2, NOW(), 'Ajuste manual: Zerar saldo (Consumo de 63 créditos pendentes)', 'saldo', 'confirmada', $3, 0, $3, NOW(), NOW())
    `, [saleId, pkg.client_id, totalVal]);

    // Inserir Item (subtotal obrigatorio)
    await client.query(`
        INSERT INTO sale_items (sale_id, product_name, quantity, unit_price, subtotal, discount_amount, total, sale_type)
        VALUES ($1, 'Atrasos (Ajuste)', $2, $3, $4, 0, $4, '03')
    `, [saleId, qtyToConsume, unitPrice, totalVal]);

    const consumptionId = uuidv4();
    await client.query(`
        INSERT INTO package_consumptions (id, package_id, sale_id, quantity, unit_price, total_value, consumed_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [consumptionId, pkg.id, saleId, qtyToConsume, unitPrice, totalVal]);

    await client.query(`
        UPDATE client_packages
        SET 
            consumed_quantity = consumed_quantity + $1,
            available_quantity = available_quantity - $1,
            updated_at = NOW()
        WHERE id = $2
    `, [qtyToConsume, pkg.id]);

    await client.query('COMMIT');
    console.log(`\n🎉 SUCESSO! Consumidos 63 créditos de SOS. Dashboard deve mostrar 0.`);

  } catch (error) {
    console.error('❌ ERRO:', error.message);
    try { await client.query('ROLLBACK'); } catch(e) {}
  } finally {
    await client.end();
  }
}

zeroSOS();
