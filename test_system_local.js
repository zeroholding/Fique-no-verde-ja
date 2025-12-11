
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// 1. Load Environment Variables
console.log('[TEST] Loading environment...');
const envPath = path.resolve(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('[TEST] Loaded .env.local');
} else {
    console.error('[TEST] ERROR: .env.local not found!');
    process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[TEST] ERROR: Missing Supabase credentials in .env.local');
    console.error('URL:', SUPABASE_URL ? 'OK' : 'MISSING');
    console.error('KEY:', SUPABASE_KEY ? 'OK' : 'MISSING');
    process.exit(1);
}

// 2. Initialize Supabase Admin
console.log('[TEST] Initializing Supabase Admin Client...');
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
});

// Helper for RPC Query
async function query(sql) {
    const sanitizedSql = sql.replace(/\s+/g, ' ').trim();
    console.log(`[QUERY] ${sanitizedSql}`);
    const { data, error } = await supabaseAdmin.rpc('exec_sql', { query: sanitizedSql });
    if (error) {
        console.error('[QUERY ERROR]', error);
        throw error;
    }
    return data || [];
}

// 3. Main Test Flow
async function runTests() {
    try {
        console.log('\n--- 1. Testing Connection (RPC exec_sql) ---');
        const timeCheck = await query("SELECT NOW() as server_time");
        console.log('[SUCCESS] Server Time:', timeCheck[0].server_time);

        console.log('\n--- 2. Fetching Admin User ---');
        // Need a user ID to create a client (created_by_user_id)
        const users = await query("SELECT id, email FROM users LIMIT 1");
        if (users.length === 0) {
            throw new Error('No users found in database to attach records to.');
        }
        const adminUser = users[0];
        console.log(`[SUCCESS] Using User: ${adminUser.email} (ID: ${adminUser.id})`);

        console.log('\n--- 3. Creating Test Client ---');
        const testClientName = `TEST_CLIENT_${Date.now()}`;
        const insertClientSql = `WITH ins AS (INSERT INTO clients (name, created_by_user_id) VALUES ('${testClientName}', '${adminUser.id}') RETURNING id) SELECT id FROM ins`;
        await query(insertClientSql);
        const clientId = 'unknown_debug'; // Placeholder
        // Fetch ID manually since we removed RETURNING to debug
        const fetchClient = await query(`SELECT id, name FROM clients WHERE name = '${testClientName}'`);
        const newClient = fetchClient[0]; 
        clientId = newClient.id;
        console.log(`[SUCCESS] Created Client: ${newClient[0].name} (ID: ${clientId})`);

        console.log('\n--- 4. Creating Test Service ---');
        // Check for existing service first
        let serviceId;
        const services = await query("SELECT id FROM services LIMIT 1");
        if (services.length > 0) {
            serviceId = services[0].id;
            console.log(`[INFO] Using existing Service ID: ${serviceId}`);
        } else {
             const insertServiceSql = `
                INSERT INTO services (name, base_price, created_by_user_id)
                VALUES ('TEST_SERVICE', 10.00, '${adminUser.id}')
                RETURNING id
            `;
            const newService = await query(insertServiceSql);
            serviceId = newService[0].id;
            console.log(`[SUCCESS] Created Test Service ID: ${serviceId}`);
        }

        console.log('\n--- 5. Creating Test Sale (Type 01) ---');
        // Create Sale
        const insertSaleSql = `
            INSERT INTO sales (client_id, user_id, total_amount, sale_type, status, payment_method)
            VALUES ('${clientId}', '${adminUser.id}', 100.00, '01', 'completed', 'pix')
            RETURNING id
        `;
        const newSale = await query(insertSaleSql);
        const saleId = newSale[0].id;
        console.log(`[SUCCESS] Created Sale ID: ${saleId}`);
        
        console.log('\n--- 6. Creating Sale Item ---');
        const insertItemSql = `
            INSERT INTO sale_items (sale_id, product_name, quantity, unit_price, subtotal)
            VALUES ('${saleId}', 'Test Product', 1, 100.00, 100.00)
            RETURNING id
        `;
        await query(insertItemSql);
        console.log(`[SUCCESS] Created Sale Item using Service ID`);

        console.log('\n--- 7. Verifying Data ---');
        const checkSale = await query(`SELECT * FROM sales WHERE id = '${saleId}'`);
        console.log(`[VERIFY] Sale Found:`, checkSale.length > 0);
        
        console.log('\n--- 8. Cleanup (Optional - Commented Out) ---');
        // await query(`DELETE FROM sales WHERE id = '${saleId}'`);
        // await query(`DELETE FROM clients WHERE id = '${clientId}'`);
        console.log('[INFO] Test data left in DB for inspection.');

        console.log('\n--- TEST COMPLETED SUCCESSFULLY ---');

    } catch (err) {
        console.error('\n[FATAL ERROR]', err);
        process.exit(1);
    }
}

runTests();
