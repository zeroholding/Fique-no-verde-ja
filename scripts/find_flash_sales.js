const { Client } = require('pg');

const connectionString = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';

async function run() {
    const client = new Client({ connectionString });
    await client.connect();
    try {
        // 1. Inspect client_packages schema
        const schemaRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'client_packages'");
        const columns = schemaRes.rows.map(r => r.column_name);
        console.log("Columns in client_packages:", columns);

        // 2. Find the client FLASH
        const clientRes = await client.query("SELECT id, name FROM clients WHERE name ILIKE '%FLASH%'");
        console.log("Clients found:", clientRes.rows);

        if (clientRes.rows.length === 0) {
            console.log("No client found with name FLASH");
            return;
        }

        // 14. Find all packages linked to any client with 'FLASH' in the name
        console.log("\n--- Searching for packages linked to 'FLASH' clients ---");
        const flashPkgSearch = await client.query(`
            SELECT cp.created_at, cp.initial_quantity, cp.total_paid, c.name, cp.sale_id, s.sale_date, s.total as sale_total
            FROM client_packages cp
            JOIN clients c ON cp.client_id = c.id
            LEFT JOIN sales s ON cp.sale_id = s.id
            WHERE c.name ILIKE '%FLASH%'
            ORDER BY cp.created_at DESC
        `);
        
        console.log(`Found ${flashPkgSearch.rows.length} package records:`);
        flashPkgSearch.rows.forEach(row => {
            const date = row.sale_date ? new Date(row.sale_date).toLocaleDateString('pt-BR') : 'Sem data (Venda)';
            const pkgDate = row.created_at ? new Date(row.created_at).toLocaleDateString('pt-BR') : 'Sem data';
            console.log(`Pkg Data: ${pkgDate} - Qtd: ${row.initial_quantity} - Pago: R$ ${row.total_paid} - Cliente: ${row.name}`);
            console.log(`   Venda Data: ${date} - Total Venda: R$ ${row.sale_total}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
