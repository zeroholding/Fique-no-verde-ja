const { Client } = require('pg');

// SQL to audit package
// We need to pair sales to packages.
// Since 'client_packages' logic seems to be One-Active-Package-Per-Service (Unified Wallet),
// we can sum all Type 02 sales for the client and service and compare to the package.
// Note: This assumes only one package exists per service or they are merged.

const connectionString = "postgres://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres";

const client = new Client({
  connectionString,
  ssl: false
});

async function run() {
  try {
    await client.connect();
    
    // Target Package from previous step
    const PACKAGE_ID = '34a09211-0d10-4dcb-9c07-c68d6ec965c1';
    
    console.log(`Auditing Package: ${PACKAGE_ID}`);
    
    const pkgRes = await client.query(`SELECT * FROM client_packages WHERE id = $1`, [PACKAGE_ID]);
    const pkg = pkgRes.rows[0];
    
    console.log("Current Package State:", {
        initial_qty: pkg.initial_quantity,
        total_paid: pkg.total_paid,
        unit_price: pkg.unit_price
    });
    
    // Find all Type 02 sales for this client and service
    // We assume the service_id matches
    const serviceId = pkg.service_id;
    const clientId = pkg.client_id;
    
    console.log(`Fetching ALL Sales for Client ${clientId}...`);
    
    // Note: We need to join sale_items to filter by service/product and type
    const salesRes = await client.query(`
        SELECT s.id, s.sale_date, si.quantity, si.total, si.unit_price, si.sale_type, si.product_id, si.product_name
        FROM sales s
        JOIN sale_items si ON s.id = si.sale_id
        WHERE s.client_id = $1 
        ORDER BY s.sale_date ASC
    `, [clientId]);
    
    let calcTotalQty = 0;
    let calcTotalPaid = 0;
    
    console.log("\nHistory relative to Service ID:", serviceId);
    salesRes.rows.forEach(r => {
        const qty = Number(r.quantity);
        const paid = Number(r.total);
        console.log(`Date: ${r.sale_date.toISOString().slice(0,10)} | Type: ${r.sale_type} | ProdID: ${r.product_id} | Qty: ${qty} | Paid: ${paid} | Name: ${r.product_name}`);
        
        // Sum if matches
        if (r.sale_type === '02' && r.product_id === serviceId) {
             calcTotalQty += qty;
             calcTotalPaid += paid;
        }
    });
    
    console.log("\n------------------------------------------------");
    console.log("AUDIT RESULTS:");
    console.log(`Calculated Total Quantity: ${calcTotalQty} | Stored: ${pkg.initial_quantity} | Diff: ${Number(pkg.initial_quantity) - calcTotalQty}`);
    console.log(`Calculated Total Paid:     ${calcTotalPaid.toFixed(2)} | Stored: ${pkg.total_paid} | Diff: ${(Number(pkg.total_paid) - calcTotalPaid).toFixed(2)}`);
    console.log(`Calculated Unit Price:     ${(calcTotalPaid/calcTotalQty).toFixed(4)} | Stored: ${Number(pkg.unit_price).toFixed(4)}`);
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
