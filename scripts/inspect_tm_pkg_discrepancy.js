const { query } = require('./lib/db');

async function check() {
    try {
        // 1. Find Client TM
        const clientRes = await query(`SELECT id, name FROM clients WHERE name ILIKE '%TM%'`);
        if (clientRes.rows.length === 0) {
            console.log('Client TM not found');
            return;
        }
        
        console.log('Found Clients:', clientRes.rows);
        const clientId = clientRes.rows[0].id; // Assuming first is correct, or I'll list all

        // 2. Check Packages
        const pkgRes = await query(`SELECT * FROM client_packages WHERE client_id = $1`, [clientId]);
        console.log('\nPackages for Client ' + clientRes.rows[0].name + ':');
        console.table(pkgRes.rows);

    } catch (e) {
        console.error(e);
    }
}

check();
