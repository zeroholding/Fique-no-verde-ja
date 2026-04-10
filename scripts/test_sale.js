const { Client } = require('pg');
const c = new Client({connectionString:'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres'});
c.connect().then(() => {
  return c.query('SELECT id, status, sale_date FROM sales WHERE id = $1', ['cb7c6a48-ec29-4150-bb68-fe99af0b314c'])
    .then(r => console.log('SALES:', r.rows))
    .then(() => c.query('SELECT id, sale_id, status FROM commissions WHERE sale_id = $1', ['cb7c6a48-ec29-4150-bb68-fe99af0b314c']))
    .then(r => console.log('COMMISSIONS:', r.rows))
    .then(() => c.query("SELECT id, sale_id, status FROM commissions WHERE status = 'cancelado' LIMIT 5"))
    .then(r => console.log('CANCELED COMMISSIONS:', r.rows))
    .then(() => c.end());
});
