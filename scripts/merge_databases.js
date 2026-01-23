
const fs = require('fs');
const path = require('path');

// Configuration
const SUPABASE_FILE = 'backup_supabase_2026-01-23.json';
const VPS_DELTA_FILE = 'scripts/vps_activity_export_2026_01_22_23.json';
const OUTPUT_FILE = 'restore_unified.sql';

console.log("Loading datasets...");
const supabaseData = JSON.parse(fs.readFileSync(SUPABASE_FILE));
const vpsDelta = JSON.parse(fs.readFileSync(VPS_DELTA_FILE));

console.log(`Supabase: ${Object.keys(supabaseData.tables).length} tables`);
console.log(`VPS Delta: ${vpsDelta.sales.length} sales, ${vpsDelta.consumptions.length} consumptions, ${vpsDelta.new_packages?.length || 0} packages`);

// Helper to escape values
const escape = (val) => {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
};

const generateInsert = (table, row) => {
  const keys = Object.keys(row).map(k => `"${k}"`).join(', ');
  const values = Object.values(row).map(escape).join(', ');
  return `INSERT INTO "${table}" (${keys}) VALUES (${values}) ON CONFLICT DO NOTHING;`;
};

// Start building SQL
let sql = `-- Unified Restoration Script
-- Generated at ${new Date().toISOString()}

BEGIN;

-- 1. Disable triggers (optional, but good for performance)
SET session_replication_role = 'replica';

-- 2. Truncate Tables involved in sync (Cascading)
TRUNCATE TABLE package_consumptions, client_packages, sale_items, sales, commissions RESTART IDENTITY CASCADE;
TRUNCATE TABLE clients, users, products, services RESTART IDENTITY CASCADE;
-- Add more truncates as needed based on Supabase dump scope

-- 3. Restore Base Data from Supabase
`;

// Order matters for FK
const tableOrder = [
  'users', 'clients', 'products', 'services', 'price_ranges', 
  'sales', 'sale_items', 'client_packages', 'package_consumptions', 'commissions'
  // Add others if present in backup like policies etc
];

const processedTables = new Set();

// Restore Ordered Tables
for (const tableName of tableOrder) {
  if (supabaseData.tables[tableName]) {
    sql += `\n-- Restoring ${tableName} (${supabaseData.tables[tableName].rowCount} rows)\n`;
    for (const row of supabaseData.tables[tableName].rows) {
      sql += generateInsert(tableName, row) + '\n';
    }
    processedTables.add(tableName);
  }
}

// Restore Remaining Tables
for (const tableName of Object.keys(supabaseData.tables)) {
  if (!processedTables.has(tableName)) {
    sql += `\n-- Restoring ${tableName} (${supabaseData.tables[tableName].rowCount} rows)\n`;
    for (const row of supabaseData.tables[tableName].rows) {
      sql += generateInsert(tableName, row) + '\n';
    }
  }
}

sql += `\n-- 4. Apply VPS Delta (Jan 22-23)\n`;

// 4.1 New Packages
if (vpsDelta.new_packages) {
    sql += `\n-- Delta: New Client Packages\n`;
    for (const pkg of vpsDelta.new_packages) {
        // Remove client_name if present (it was a join field)
        const { client_name, ...pkgRow } = pkg;
        sql += generateInsert('client_packages', pkgRow) + '\n';
    }
}

// 4.2 Sales & Items
const existingSaleIds = new Set(supabaseData.tables['sales']?.rows.map(r => r.id) || []);

sql += `\n-- Delta: Sales & Items\n`;
for (const sale of vpsDelta.sales) {
    if (existingSaleIds.has(sale.id)) continue; 
    
    // Extract items
    const { items, client_name, ...saleRow } = sale;
    
    // Clean keys that might not exist in target table or are joins
    delete saleRow.client_name; 

    sql += generateInsert('sales', saleRow) + '\n';

    if (items) {
        for (const item of items) {
            sql += generateInsert('sale_items', item) + '\n';
        }
    }
}

// 4.3 Consumptions
const existingConsumptionIds = new Set(supabaseData.tables['package_consumptions']?.rows.map(r => r.id) || []);

sql += `\n-- Delta: Consumptions\n`;
for (const cons of vpsDelta.consumptions) {
    if (existingConsumptionIds.has(cons.id)) continue;

    const { client_name, service_name, ...consRow } = cons; 
    sql += generateInsert('package_consumptions', consRow) + '\n';

    // IMPORTANT: Update Client Package Balance
    // This is calculating the effect of this consumption on the package state
    if (consRow.client_package_id || consRow.package_id) {
         const pid = consRow.client_package_id || consRow.package_id;
         const qty = consRow.quantity;
         sql += `UPDATE client_packages SET consumed_quantity = consumed_quantity + ${qty}, available_quantity = available_quantity - ${qty} WHERE id = '${pid}';\n`;
    }
}

sql += `
-- 5. Restore Triggers
SET session_replication_role = 'origin';

COMMIT;
`;

fs.writeFileSync(OUTPUT_FILE, sql);
console.log(`Unified SQL generated: ${OUTPUT_FILE}`);
console.log(`You can now run this SQL against the VPS database.`);
