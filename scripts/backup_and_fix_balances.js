const { Client } = require('pg');
const fs = require('fs');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function backupAndFix() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  try {
    await client.connect();
    console.log('=== BACKUP E CORREÇÃO DE SALDOS ===\n');

    // ================== FASE 1: BACKUP ==================
    console.log('--- FASE 1: BACKUP ---\n');

    // Backup client_packages
    const packagesBackup = await client.query(`
      SELECT * FROM client_packages 
      WHERE client_id IN (
        SELECT id FROM clients WHERE client_type = 'package'
      )
    `);
    fs.writeFileSync(
      `scripts/backup_client_packages_${timestamp}.json`,
      JSON.stringify(packagesBackup.rows, null, 2)
    );
    console.log(`✅ Backup client_packages: ${packagesBackup.rows.length} registros`);

    // Backup package_consumptions
    const consumptionsBackup = await client.query(`SELECT * FROM package_consumptions`);
    fs.writeFileSync(
      `scripts/backup_package_consumptions_${timestamp}.json`,
      JSON.stringify(consumptionsBackup.rows, null, 2)
    );
    console.log(`✅ Backup package_consumptions: ${consumptionsBackup.rows.length} registros`);

    // Backup vendas órfãs (para referência)
    const orphanSalesBackup = await client.query(`
      SELECT s.* FROM sales s
      LEFT JOIN package_consumptions pc ON pc.sale_id = s.id
      WHERE s.observations LIKE '%[PCT:%'
        AND pc.id IS NULL
    `);
    fs.writeFileSync(
      `scripts/backup_orphan_sales_${timestamp}.json`,
      JSON.stringify(orphanSalesBackup.rows, null, 2)
    );
    console.log(`✅ Backup vendas órfãs: ${orphanSalesBackup.rows.length} registros`);

    console.log('\n📁 Backups salvos em scripts/backup_*_' + timestamp + '.json\n');

    // ================== FASE 2: ANÁLISE PRÉ-FIX ==================
    console.log('--- FASE 2: ANÁLISE PRÉ-FIX ---\n');

    const divergencias = await client.query(`
      SELECT 
        cp.id AS package_id,
        c.name AS transportadora,
        cp.consumed_quantity AS consumed_atual,
        COALESCE(SUM(pc.quantity), 0)::int AS soma_real,
        cp.consumed_quantity - COALESCE(SUM(pc.quantity), 0)::int AS diferenca
      FROM client_packages cp
      JOIN clients c ON cp.client_id = c.id
      LEFT JOIN package_consumptions pc ON pc.package_id = cp.id
      WHERE c.client_type = 'package'
      GROUP BY cp.id, c.name, cp.consumed_quantity
      HAVING cp.consumed_quantity != COALESCE(SUM(pc.quantity), 0)::int
    `);

    if (divergencias.rows.length === 0) {
      console.log('✅ Nenhuma divergência encontrada. Nada a corrigir.');
      return;
    }

    console.log('⚠️ Divergências encontradas:\n');
    for (const d of divergencias.rows) {
      console.log(`  ${d.transportadora}:`);
      console.log(`    consumed_atual: ${d.consumed_atual}`);
      console.log(`    soma_real: ${d.soma_real}`);
      console.log(`    diferença: ${d.diferenca}`);
      console.log(`    package_id: ${d.package_id}\n`);
    }

    // ================== FASE 3: CORREÇÃO ==================
    console.log('--- FASE 3: CORREÇÃO ---\n');

    await client.query('BEGIN');

    for (const d of divergencias.rows) {
      const newConsumed = Number(d.soma_real);
      const packageId = d.package_id;

      // Buscar initial_quantity para recalcular available
      const pkgRes = await client.query(
        'SELECT initial_quantity FROM client_packages WHERE id = $1',
        [packageId]
      );
      const initialQty = Number(pkgRes.rows[0].initial_quantity);
      const newAvailable = initialQty - newConsumed;

      console.log(`Corrigindo ${d.transportadora}...`);
      console.log(`  consumed: ${d.consumed_atual} -> ${newConsumed}`);
      console.log(`  available: -> ${newAvailable}`);

      await client.query(`
        UPDATE client_packages 
        SET 
          consumed_quantity = $1,
          available_quantity = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [newConsumed, newAvailable, packageId]);

      console.log(`  ✅ Corrigido!\n`);
    }

    await client.query('COMMIT');

    // ================== FASE 4: VERIFICAÇÃO ==================
    console.log('--- FASE 4: VERIFICAÇÃO PÓS-FIX ---\n');

    const verificacao = await client.query(`
      SELECT 
        c.name AS transportadora,
        cp.initial_quantity AS init,
        cp.consumed_quantity AS consumed,
        cp.available_quantity AS available,
        (cp.initial_quantity - cp.consumed_quantity) AS calculado
      FROM client_packages cp
      JOIN clients c ON cp.client_id = c.id
      WHERE c.client_type = 'package'
      ORDER BY c.name
    `);

    for (const v of verificacao.rows) {
      const ok = Number(v.available) === Number(v.calculado) ? '✅' : '❌';
      console.log(`${ok} ${v.transportadora}: init=${v.init}, consumed=${v.consumed}, available=${v.available}`);
    }

    console.log('\n🎉 Correção concluída com sucesso!');

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

backupAndFix();
