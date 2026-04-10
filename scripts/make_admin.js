const { Client } = require('pg');

async function main() {
  const c = new Client({connectionString:'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres'});
  await c.connect();
  try {
    const { rows } = await c.query('UPDATE users SET is_admin = true WHERE email ILIKE $1 RETURNING id, first_name, email, is_admin', ['evellyn%@gmail.com%']);
    console.log(rows);
    if(rows.length === 0) {
        const { rows: search } = await c.query('SELECT id, first_name, email, is_admin FROM users WHERE first_name ILIKE $1', ['%evellyn%']);
        console.log("Found by name instead:", search);
    }
  } catch (err) {
    console.error(err.message);
  } finally {
    await c.end();
  }
}

main();
