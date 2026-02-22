const { Client } = require('pg');
const c = new Client({
    connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
    ssl: false
});

async function run() {
    await c.connect();
    try {
        await c.query('BEGIN');

        // 1. Atualizar tabela services
        // Tudo relacionado a Atrasos -> "Atrasos"
        const atrasosNamesServices = ['Remoção de Atrasos', 'ATRASOS', 'Atrasos (Ajuste)', 'Produto Indefinido'];
        const r1 = await c.query(
            `UPDATE services SET name = 'Atrasos' WHERE name = ANY($1) RETURNING id, name`,
            [atrasosNamesServices]
        );
        console.log(`[services] ${r1.rowCount} serviços renomeados para "Atrasos"`);

        // Tudo relacionado a Reclamação -> "Reclamação"
        const reclamacaoNamesServices = ['Remoção de Reclamações', 'Reclamações'];
        const r2 = await c.query(
            `UPDATE services SET name = 'Reclamação' WHERE name = ANY($1) RETURNING id, name`,
            [reclamacaoNamesServices]
        );
        console.log(`[services] ${r2.rowCount} serviços renomeados para "Reclamação"`);

        // 2. Atualizar sale_items.product_name (para itens sem service linkado)
        const atrasosNamesSaleItems = ['Remoção de Atrasos', 'ATRASOS', 'Atrasos (Ajuste)', 'Produto Indefinido'];
        const r3 = await c.query(
            `UPDATE sale_items SET product_name = 'Atrasos' WHERE product_name = ANY($1) RETURNING id`,
            [atrasosNamesSaleItems]
        );
        console.log(`[sale_items] ${r3.rowCount} itens com product_name renomeado para "Atrasos"`);

        const reclamacaoNamesSaleItems = ['Remoção de Reclamações', 'Reclamações'];
        const r4 = await c.query(
            `UPDATE sale_items SET product_name = 'Reclamação' WHERE product_name = ANY($1) RETURNING id`,
            [reclamacaoNamesSaleItems]
        );
        console.log(`[sale_items] ${r4.rowCount} itens com product_name renomeado para "Reclamação"`);

        await c.query('COMMIT');
        console.log('\n✅ Concluído! Nomes finais no banco:');

        // Verify
        const check = await c.query(`
            SELECT 
                COALESCE(serv.name, si.product_name) AS nome,
                COUNT(DISTINCT s.id) AS atendimentos
            FROM sale_items si
            LEFT JOIN services serv ON si.product_id = serv.id
            LEFT JOIN sales s ON si.sale_id = s.id
            WHERE s.status != 'cancelada'
            GROUP BY COALESCE(serv.name, si.product_name)
            ORDER BY atendimentos DESC
        `);
        check.rows.forEach(row => console.log(`  "${row.nome}" → ${row.atendimentos} atendimentos`));

    } catch(e) {
        await c.query('ROLLBACK');
        console.error('ERRO - rollback realizado:', e.message);
    } finally {
        await c.end();
    }
}

run();
