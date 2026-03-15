const { Pool } = require('pg');

const DB_CONNECTION = "postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres";

async function main() {
  const pool = new Pool({ connectionString: DB_CONNECTION });

  try {
    const saleId = '6ddf26d3-bc6c-4f98-8b4e-404b48f972be';
    console.log("SALE DB RECORD:");
    const res = await pool.query('SELECT total, subtotal, total_discount, discount_amount, cupom_id FROM sales WHERE id = $1', [saleId]);
    console.table(res.rows);

    console.log("\nSALE_ITEMS:");
    const itemsRes = await pool.query('SELECT total, subtotal, discount_amount FROM sale_items WHERE sale_id = $1', [saleId]);
    console.table(itemsRes.rows);

  } catch (error) {
    console.error(error);
  } finally {
    await pool.end();
  }
}

main();
