const { Client } = require('pg');

const client = new Client({ 
    connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres', 
    ssl: false 
});

async function runUpdate() {
    await client.connect();

    try {
        console.log("Iniciando atualização dos totais das vendas Tipo 03 importadas hoje...");
        
        const res = await client.query(`
            UPDATE sales s
            SET total = s.subtotal
            FROM sale_items si
            WHERE s.id = si.sale_id
              AND si.sale_type = '03'
              AND s.total = 0 
              AND s.subtotal > 0
            RETURNING s.id, s.total;
        `);

        console.log(`Sucesso! ${res.rowCount} vendas do Tipo 03 atualizadas para o valor correto.`);
        
        // Print out 3 just to verify
        if (res.rowCount > 0) {
            console.log("Exemplos atualizados:");
            res.rows.slice(0, 3).forEach(r => console.log(`ID: ${r.id} | Novo Total: R$ ${r.total}`));
        }

    } catch (err) {
        console.error("Erro ao atualizar base de dados:", err);
    } finally {
        await client.end();
    }
}

runUpdate();
