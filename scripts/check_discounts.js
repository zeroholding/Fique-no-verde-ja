const { Client } = require('pg');

const client = new Client({ 
    connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres', 
    ssl: false 
});

async function run() {
    await client.connect();
    try {
        // Check how many sales have negative discounts
        const res = await client.query(`
            SELECT 
                COUNT(*) FILTER (WHERE total_discount < 0) AS negative_count,
                COUNT(*) FILTER (WHERE total_discount > 0) AS positive_count,
                SUM(total_discount) FILTER (WHERE total_discount < 0) AS sum_negative,
                MIN(sale_date) FILTER (WHERE total_discount < 0) AS oldest_negative,
                MAX(sale_date) FILTER (WHERE total_discount < 0) AS newest_negative
            FROM sales
            WHERE total_discount != 0
        `);
        const row = res.rows[0];
        console.log(`Descontos NEGATIVOS: ${row.negative_count} vendas (soma: R$ ${row.sum_negative})`);
        console.log(`Descontos POSITIVOS: ${row.positive_count} vendas`);
        console.log(`Período das negativas: ${row.oldest_negative} até ${row.newest_negative}`);
    } catch(e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

run();
