
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres',
});

async function check() {
  await client.connect();
  const res = await client.query("SELECT * FROM sales LIMIT 1");
  console.log("Sales Columns:", Object.keys(res.rows[0]));
  await client.end();
}

check();
