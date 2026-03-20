
const { Pool } = require('pg');
const pool = new Pool({ 
    connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres' 
});

async function run() {
    try {
        const clientRes = await pool.query("SELECT id, name FROM clients WHERE name ILIKE '%J3%'");
        console.log("Clients found:", clientRes.rows);
        
        if (clientRes.rows.length === 0) return;
        const clientId = clientRes.rows[0].id;

        console.log("\n--- CLIENT PACKAGES ---");
        const pkgs = await pool.query("SELECT id, initial_quantity, available_quantity, consumed_quantity, is_active, created_at, sale_id FROM client_packages WHERE client_id = $1", [clientId]);
        console.table(pkgs.rows);

        console.log("\n--- SALES (TYPE 02 - RECHARGES) ---");
        const sales = await pool.query(`
            SELECT s.id, s.sale_date, si.quantity, s.status, s.total 
            FROM sales s 
            JOIN sale_items si ON s.id = si.sale_id 
            WHERE s.client_id = $1 AND si.sale_type = '02'
            AND s.status != 'cancelada'
        `, [clientId]);
        console.table(sales.rows);

        console.log("\n--- CONSUMPTIONS ---");
        const consumptions = await pool.query(`
            SELECT pc.id, pc.quantity, pc.consumed_at, s.status as sale_status
            FROM package_consumptions pc
            JOIN client_packages cp ON pc.package_id = cp.id
            JOIN sales s ON pc.sale_id = s.id
            WHERE cp.client_id = $1 AND s.status != 'cancelada'
        `, [clientId]);
        
        const sumCons = consumptions.rows.reduce((acc, r) => acc + Number(r.quantity), 0);
        console.log("Total consumptions found:", consumptions.rowCount);
        console.log("Sum of quantities in package_consumptions:", sumCons);

        // Simulate the public-statement logic
        console.log("\n--- SIMULATING PUBLIC STATEMENT CALCULATION ---");
        let totalAcquired = 0;
        
        // 1. Packages
        for (const pkg of pkgs.rows) {
            console.log(`Adding package initial_qty: ${pkg.initial_quantity}`);
            totalAcquired += Number(pkg.initial_quantity);
        }
        
        // 2. Invisible reloads (Sales not in client_packages)
        const pkgSaleIds = pkgs.rows.map(p => p.sale_id);
        const invisibleSales = sales.rows.filter(s => !pkgSaleIds.includes(s.id));
        for (const s of invisibleSales) {
            console.log(`Adding invisible reload qty: ${s.quantity}`);
            totalAcquired += Number(s.quantity);
        }

        console.log("TOTAL ACQUIRED (Calc):", totalAcquired);
        console.log("TOTAL CONSUMED (Calc):", sumCons);
        console.log("RESULTING BALANCE (Calc):", totalAcquired - sumCons);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
