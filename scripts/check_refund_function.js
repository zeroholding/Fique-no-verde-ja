const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function checkFunction() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== CHECKING STORED FUNCTION ===\n');
    
    const res = await client.query(`
      SELECT routine_name, routine_definition 
      FROM information_schema.routines 
      WHERE routine_name = 'refund_package_consumption'
    `);
    
    if (res.rows.length > 0) {
        console.log("Function found!");
        console.log(res.rows[0]);
    } else {
        console.log("❌ Function 'refund_package_consumption' NOT FOUND.");
    }

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

checkFunction();
