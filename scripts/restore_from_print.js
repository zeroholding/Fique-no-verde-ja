const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function restoreFromPrint() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== RESTAURAÇÃO BASEADA NO PRINT (MANHÃ) ===\n');

    // Valores extraídos do print do usuário
    const restoreData = [
        { client: 'TM',       available: 317, consumed: 1468, initial: 1785 },
        { client: 'MECONECT', available: 83,  consumed: 17,   initial: 100 },
        { client: 'J3',       available: 536, consumed: 1400, initial: 1936 },
        { client: 'W.A',      available: 199, consumed: 1,    initial: 200 },
        { client: 'FLASH',    available: 40,  consumed: 142,  initial: 182 },
        { client: 'FLEXBOYS', available: 200, consumed: 0,    initial: 200 }
    ];

    await client.query('BEGIN');

    for (const data of restoreData) {
        // Buscar ID do pacote Atrasos ativo
        const res = await client.query(`
            SELECT cp.id 
            FROM client_packages cp
            JOIN clients c ON cp.client_id = c.id
            JOIN services s ON cp.service_id = s.id
            WHERE UPPER(c.name) = $1 
            AND UPPER(s.name) = 'ATRASOS'
            AND cp.is_active = true
        `, [data.client]);

        if (res.rows.length === 0) {
            console.log(`❌ Pacote não encontrado para ${data.client}`);
            continue;
        }

        const pkgId = res.rows[0].id;

        await client.query(`
            UPDATE client_packages
            SET 
                initial_quantity = $1,
                consumed_quantity = $2,
                available_quantity = $3,
                updated_at = NOW()
            WHERE id = $4
        `, [data.initial, data.consumed, data.available, pkgId]);

        console.log(`✅ ${data.client} restaurado para: Init=${data.initial}, Cons=${data.consumed}, Avail=${data.available}`);
    }

    await client.query('COMMIT');
    console.log('\n🎉 SUCESSO! Saldos forçados para os valores do print.');

  } catch (error) {
    console.error('❌ ERRO:', error.message);
    try { await client.query('ROLLBACK'); } catch(e) {}
  } finally {
    await client.end();
  }
}

restoreFromPrint();
