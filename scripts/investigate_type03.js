const { Client } = require('pg');

const client = new Client({ 
    connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
    ssl: false 
});

async function run() {
    await client.connect();
    try {
        const res = await client.query(`
            SELECT id, total, sale_date, created_at, commission_amount, status
            FROM sales 
            WHERE id = '72f18ddf-6b6d-40f7-97d9-bab593cc8607'
        `);
        res.rows.forEach(r => {
            console.log(`Sale ID: ${r.id}`);
            console.log(`- Total: R$ ${r.total} | Commission: R$ ${r.commission_amount}`);
            console.log(`- Sale Date: ${r.sale_date}`);
            console.log(`- Created At: ${r.created_at}`);
        });
        
        // Also let's check the CSV headers of that file just to be sure
        const fs = require('fs');
        const fileContent = fs.readFileSync('C:\\Users\\Micro\\Desktop\\GIANLUCA TRABALHO\\Fique-no-verde-ja\\BD VENDAS FNVJ - 202512 - TIPO 03(Planilha2).csv', 'latin1');
        const lines = fileContent.split('\n');
        console.log("CSV Headers:", lines[0]);
        console.log("CSV Row 1:", lines[1] ? lines[1].substring(0, 100) : '');
        
    } finally {
        await client.end();
    }
}

run();
