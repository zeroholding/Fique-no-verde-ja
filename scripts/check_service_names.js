const { Client } = require('pg');
const c = new Client({
    connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
    ssl: false
});

c.connect().then(() => c.query(`
    SELECT 
        COALESCE(serv.name, si.product_name) AS nome,
        COUNT(DISTINCT s.id) AS atendimentos
    FROM sale_items si
    LEFT JOIN services serv ON si.product_id = serv.id
    LEFT JOIN sales s ON si.sale_id = s.id
    WHERE s.status != 'cancelada'
    GROUP BY COALESCE(serv.name, si.product_name)
    ORDER BY atendimentos DESC
`)).then(r => {
    console.log("Nomes distintos no banco de dados:");
    r.rows.forEach(row => console.log(`  "${row.nome}" → ${row.atendimentos} atendimentos`));
    return c.end();
}).catch(e => { console.error(e); c.end(); });
