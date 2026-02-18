const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

try {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    console.log("Found .env.local at:", envPath);
    const buffer = fs.readFileSync(envPath);
    let envConfig = '';
    
    // Check for UTF-16 LE BOM
    if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
        envConfig = buffer.slice(2).toString('utf16le');
    }
    // Check for UTF-16 BE BOM (unlikely on Windows but possible)
    else if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
        envConfig = buffer.slice(2).toString('utf16be');
    }
    // Fallback: Check for null bytes which indicate UTF-16
    else if (buffer.indexOf(0x00) !== -1) {
        // Assume LE if we see nulls and no BOM
        envConfig = buffer.toString('utf16le');
    } else {
        envConfig = buffer.toString('utf8');
    }

    console.log("Decoded Content Preview:", envConfig.substring(0, 100).replace(/\r/g, '\\r').replace(/\n/g, '\\n'));
    const lines = envConfig.split(/\r?\n/);
    for (const line of lines) {
        if (!line || line.startsWith('#')) continue;
        const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            const key = match[1];
            let value = match[2] || '';
            // Handle surrounding quotes
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            process.env[key] = value;
        }
    }
  } else {
    console.log("Could not find .env.local at:", envPath);
  }
} catch (e) { console.error("Error loading env:", e); }

// Connection string from user (mapped port 5434)
const connectionString = "postgres://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres";

const client = new Client({
  connectionString: connectionString,
  ssl: false
});

async function run() {
  try {
    await client.connect();
    
    // 1. Search for Client "TM"
    console.log(`\n--- Searching for Client 'TM' ---`);
    const clientRes = await client.query(`SELECT * FROM clients WHERE name ILIKE '%TM%' LIMIT 5`);
    
    if (clientRes.rows.length === 0) {
        console.log("Client 'TM' not found.");
        return;
    }
    
    console.table(clientRes.rows.map(c => ({ id: c.id, name: c.name })));
    
    const clientId = clientRes.rows[0].id;
    
    // 2. Get Package for Client
    console.log(`\n--- Inspecting Package for Client: ${clientId} ---`);
    const pkgRes = await client.query(`SELECT * FROM client_packages WHERE client_id = $1`, [clientId]);
    
    if (pkgRes.rows.length === 0) {
        console.log("No package found.");
    } else {
        const p = pkgRes.rows[0];
        console.log("Raw Package Data:", JSON.stringify(p, null, 2));
        
        console.log("\n--- Math Checks ---");
        console.log(`Stored Unit Price: ${p.unit_price}`);
        console.log(`Total Paid (${p.total_paid}) / Initial (${p.initial_quantity}) = ${(Number(p.total_paid) / Number(p.initial_quantity)).toFixed(4)}`);
        console.log(`Total Paid / Available (${p.available_quantity}) = ${(Number(p.total_paid) / Number(p.available_quantity)).toFixed(4)}`);
    }

    // End of inspection
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
