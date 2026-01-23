const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

const IDS_TO_DELETE = [
    '473d0f76-6e54-4b16-94d0-5dffdff99d5b', // J3
    '005ff71f-bbec-4935-a4ac-322ea30efefe', // J3
    '192e444f-1f0f-4f3f-a334-b8144d4dce25', // J3
    'df4ee6d9-7619-4038-8ee5-eed856a3302d', // J3
    '34aa17ce-ba3e-442c-ade6-33482c8f2ad8', // TM
    '26ff09c9-ce43-490f-8187-4c6b6fa6d55d'  // TM
];

async function undoOrphans() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log(`=== DESFAZENDO CRIAÇÃO DE CONSUMOS ÓRFÃS (${IDS_TO_DELETE.length} registros) ===\n`);

    await client.query('BEGIN');

    for (const id of IDS_TO_DELETE) {
        const res = await client.query('DELETE FROM package_consumptions WHERE id = $1 RETURNING id', [id]);
        if (res.rowCount > 0) {
            console.log(`✅ Deletado consumo: ${id}`);
        } else {
            console.log(`⚠️ Consumo não encontrado (já deletado?): ${id}`);
        }
    }

    await client.query('COMMIT');
    console.log('\n🎉 Rollback de consumos órfãos concluído.');

  } catch (error) {
    console.error('❌ ERRO:', error.message);
    try { await client.query('ROLLBACK'); } catch(e) {}
  } finally {
    await client.end();
  }
}

undoOrphans();
