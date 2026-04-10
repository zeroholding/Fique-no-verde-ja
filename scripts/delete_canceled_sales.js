const { Client } = require('pg');

async function main() {
  const c = new Client({connectionString:'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres'});
  await c.connect();

  try {
    console.log("\nFinding canceled sales...");
    const { rows: canceledSales } = await c.query(`SELECT id FROM sales WHERE status = 'cancelada'`);
    console.log(`Found ${canceledSales.length} canceled sales.`);

    let deletedCount = 0;
    
    for (const row of canceledSales) {
        const sid = row.id;
        console.log(`Deleting sale ${sid}...`);
        
        // Single transaction per sale
        await c.query('BEGIN');
        try {
            await c.query("DELETE FROM package_consumptions WHERE sale_id = $1", [sid]);
            await c.query("UPDATE client_packages SET sale_id = NULL WHERE sale_id = $1", [sid]);
            
            for (const table of ['financial_transactions', 'notifications', 'invoices', 'commission_payments', 'logs']) {
               try { await c.query(`SAVEPOINT before_table`); await c.query(`DELETE FROM ${table} WHERE sale_id = $1`, [sid]); } catch(e){ await c.query(`ROLLBACK TO before_table`); }
            }
            
            await c.query("DELETE FROM commissions WHERE sale_id = $1", [sid]);
            
            try { await c.query(`SAVEPOINT before_refunds`); await c.query("DELETE FROM sale_refunds WHERE sale_id = $1", [sid]); } catch(e){ await c.query(`ROLLBACK TO before_refunds`); }
            
            await c.query("DELETE FROM sale_items WHERE sale_id = $1", [sid]);
            await c.query("DELETE FROM sales WHERE id = $1", [sid]);
            
            await c.query('COMMIT');
            deletedCount++;
        } catch (err) {
            await c.query('ROLLBACK');
            console.error(`Error deleting sale ${sid}:`, err.message);
        }
    }
    
    console.log(`Successfully deleted ${deletedCount} canceled sales.`);
  } catch (err) {
    console.error(err);
  } finally {
    await c.end();
  }
}

main();
