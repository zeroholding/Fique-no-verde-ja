const { Client } = require('pg');
const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function run() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  try {
    await client.connect();
    
    // Check TOKYO delays showing delay_hours and shipping mode
    const res = await client.query(`
      SELECT limit_date, shipped_date, delay_hours, delay_range, shipping_mode, logistic_type, status 
      FROM mercadolivre_delays 
      WHERE ml_user_id = '242678667' AND delay_hours > 0
    `);
    console.log("TOKYO DELAyes > 0:", res.rows.length);
    console.log(res.rows.slice(0, 5));

    // Check ALL TOKYO orders
    const resAll = await client.query(`
      SELECT count(*)
      FROM mercadolivre_delays 
      WHERE ml_user_id = '242678667'
    `);
    console.log("TOKYO ALL ORDERS:", resAll.rows[0].count);

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
