const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function fixOrphanSales() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== CORREÇÃO: VENDAS ÓRFÃS CONFIRMADAS ===\n');

    // Buscar vendas órfãs CONFIRMADAS
    const orphans = await client.query(`
      SELECT 
        s.id AS sale_id,
        s.sale_date,
        s.observations,
        c.name AS cliente_final,
        si.quantity AS qty_item,
        si.product_name
      FROM sales s
      JOIN clients c ON s.client_id = c.id
      JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN package_consumptions pc ON pc.sale_id = s.id
      WHERE s.observations LIKE '%[PCT:%'
        AND pc.id IS NULL
        AND s.status = 'confirmada'
      ORDER BY s.sale_date DESC
    `);

    if (orphans.rows.length === 0) {
      console.log('✅ Nenhuma venda órfã confirmada encontrada.');
      return;
    }

    console.log(`Encontradas ${orphans.rows.length} vendas órfãs confirmadas:\n`);

    await client.query('BEGIN');

    for (const sale of orphans.rows) {
      // Extrair transportadora
      const match = sale.observations.match(/\[PCT:\s*([^\]]+)\]/);
      const transportadoraNome = match ? match[1].trim() : null;

      if (!transportadoraNome) {
        console.log(`⚠️ Sale ${sale.sale_id}: Não foi possível extrair transportadora. Pulando.`);
        continue;
      }

      // Buscar package_id da transportadora (Atrasos)
      const pkgRes = await client.query(`
        SELECT cp.id AS package_id, cp.available_quantity, cp.consumed_quantity, cp.unit_price
        FROM client_packages cp
        JOIN clients c ON cp.client_id = c.id
        JOIN services s ON cp.service_id = s.id
        WHERE UPPER(c.name) = UPPER($1)
          AND UPPER(s.name) = 'ATRASOS'
          AND cp.is_active = true
        LIMIT 1
      `, [transportadoraNome]);

      if (pkgRes.rows.length === 0) {
        console.log(`⚠️ Sale ${sale.sale_id}: Pacote não encontrado para ${transportadoraNome}. Pulando.`);
        continue;
      }

      const pkg = pkgRes.rows[0];
      const qty = Number(sale.qty_item);
      const unitPrice = Number(pkg.unit_price);

      console.log(`Processando: ${sale.cliente_final} | Transportadora: ${transportadoraNome}`);
      console.log(`  Quantidade: ${qty}`);
      console.log(`  Package ID: ${pkg.package_id}`);

      // 1. Criar registro em package_consumptions
      const consumptionId = uuidv4();
      await client.query(`
        INSERT INTO package_consumptions (id, package_id, sale_id, quantity, unit_price, total_value, consumed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [consumptionId, pkg.package_id, sale.sale_id, qty, unitPrice, qty * unitPrice, sale.sale_date]);
      
      console.log(`  ✅ Consumo criado: ${consumptionId}`);

      // 2. Atualizar saldo do pacote
      await client.query(`
        UPDATE client_packages
        SET 
          consumed_quantity = consumed_quantity + $1,
          available_quantity = available_quantity - $1,
          updated_at = NOW()
        WHERE id = $2
      `, [qty, pkg.package_id]);
      
      console.log(`  ✅ Saldo atualizado: -${qty} créditos\n`);
    }

    await client.query('COMMIT');

    // Verificação final
    console.log('\n--- VERIFICAÇÃO PÓS-FIX ---\n');
    
    const verificacao = await client.query(`
      SELECT 
        c.name AS transportadora,
        cp.initial_quantity AS init,
        cp.consumed_quantity AS consumed,
        cp.available_quantity AS available
      FROM client_packages cp
      JOIN clients c ON cp.client_id = c.id
      WHERE c.client_type = 'package'
        AND UPPER(c.name) IN ('J3', 'TM')
      ORDER BY c.name
    `);

    for (const v of verificacao.rows) {
      console.log(`${v.transportadora}: init=${v.init}, consumed=${v.consumed}, available=${v.available}`);
    }

    console.log('\n🎉 Correção de vendas órfãs concluída!');

  } catch (error) {
    console.error('❌ ERRO:', error.message);
    try {
      await client.query('ROLLBACK');
      console.log('⚠️ ROLLBACK executado.');
    } catch (e) {}
  } finally {
    await client.end();
  }
}

fixOrphanSales();
