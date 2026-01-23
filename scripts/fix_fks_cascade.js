const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function fixFksCascade() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== FIXING CONSTRAINTS TO CASCADE ===\n');

    // 1. Fix package_consumptions
    console.log('Fixing package_consumptions.sale_id...');
    await client.query(`
      ALTER TABLE package_consumptions
      DROP CONSTRAINT IF EXISTS package_consumptions_sale_id_fkey;
    `);
    await client.query(`
      ALTER TABLE package_consumptions
      ADD CONSTRAINT package_consumptions_sale_id_fkey
      FOREIGN KEY (sale_id) REFERENCES sales(id)
      ON DELETE CASCADE;
    `);
    console.log('✅ package_consumptions_sale_id_fkey -> CASCADE');

    // 2. Fix sale_items (Checks)
    console.log('Fixing sale_items.sale_id...');
    await client.query(`
      ALTER TABLE sale_items
      DROP CONSTRAINT IF EXISTS sale_items_sale_id_fkey;
    `);
    // NOTE: Check if constraint name is correct on your DB, usually safe to drop/add if standard naming was used
    // If not, we rely on the migration logic.
    await client.query(`
      ALTER TABLE sale_items
      ADD CONSTRAINT sale_items_sale_id_fkey
      FOREIGN KEY (sale_id) REFERENCES sales(id)
      ON DELETE CASCADE;
    `);
    console.log('✅ sale_items_sale_id_fkey -> CASCADE');

    // 3. Fix sale_refunds (Checks)
    console.log('Fixing sale_refunds.sale_id...');
    try {
      await client.query(`
        ALTER TABLE sale_refunds
        DROP CONSTRAINT IF EXISTS sale_refunds_sale_id_fkey;
      `);
      await client.query(`
        ALTER TABLE sale_refunds
        ADD CONSTRAINT sale_refunds_sale_id_fkey
        FOREIGN KEY (sale_id) REFERENCES sales(id)
        ON DELETE CASCADE;
      `);
      console.log('✅ sale_refunds_sale_id_fkey -> CASCADE');
    } catch (e) {
      console.log('⚠️ sale_refunds table might not exist or error: ' + e.message);
    }
    
    // 4. Fix commissions
     console.log('Fixing commissions.sale_id...');
     try {
       await client.query(`
         ALTER TABLE commissions
         DROP CONSTRAINT IF EXISTS commissions_sale_id_fkey;
       `);
       await client.query(`
         ALTER TABLE commissions
         ADD CONSTRAINT commissions_sale_id_fkey
         FOREIGN KEY (sale_id) REFERENCES sales(id)
         ON DELETE CASCADE;
       `);
       console.log('✅ commissions_sale_id_fkey -> CASCADE');
     } catch (e) {
       console.log('⚠️ commissions table might not exist or error: ' + e.message);
     }

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

fixFksCascade();
