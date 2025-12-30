
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Load environment variables manually
const envPath = path.resolve(__dirname, '../.env.local');
const envConfig = require('dotenv').parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

console.log(`Testing connection to: ${supabaseUrl}`);

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    console.log('Attempting to fetch current timestamp from DB...');
    const start = Date.now();
    try {
        const { data, error } = await supabase.rpc('exec_sql', { sql: 'SELECT now()' });
        
        if (error) {
            console.error('RPC Error:', error);
            // Fallback to simple select if RPC fails
            const { data: tableData, error: tableError } = await supabase.from('sales').select('count', { count: 'exact', head: true });
            if (tableError) {
                console.error('Table Select Error:', tableError);
            } else {
                 console.log('Table connection successful (Health Check).');
            }
        } else {
            console.log('Connection Successful!');
            console.log('DB Time:', data);
        }
    } catch (e) {
        console.error('Network/Client Error:', e);
    }
    console.log(`Duration: ${Date.now() - start}ms`);
}

testConnection();
