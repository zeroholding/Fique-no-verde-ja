
const fs = require('fs');

const BACKUP_FILE = 'backup_supabase_2026-01-23.json';
const data = JSON.parse(fs.readFileSync(BACKUP_FILE));

// Find J3 Client
const client = data.tables.clients.rows.find(c => c.name === 'J3');
if (!client) { console.log('J3 not found'); process.exit(); }
const clientId = client.id;
console.log(`J3 Client ID: ${clientId}`);

// 1. Initial Packages
const packages = data.tables.client_packages.rows.filter(cp => cp.client_id === clientId);
const initial = packages.reduce((sum, p) => sum + Number(p.initial_quantity), 0);

// 2. Invisible Reloads (Type 02 not in packages)
// Need to find sales for client that are type 02 and ID NOT in packages
const pkgSaleIds = new Set(packages.map(p => p.sale_id).filter(id => id));
const sales = data.tables.sales.rows.filter(s => s.client_id === clientId);

let reloads = 0;
for (const s of sales) {
    // We need sale items to check type 02
    // But data structure separates them.
    // Let's filter items first.
}

const saleItems = data.tables.sale_items.rows;
const j3SaleIds = new Set(sales.map(s => s.id));

const reloadItems = saleItems.filter(si => 
    j3SaleIds.has(si.sale_id) && 
    si.sale_type === '02' && 
    !pkgSaleIds.has(si.sale_id)
);

reloads = reloadItems.reduce((sum, si) => sum + Number(si.quantity), 0);

// 3. Consumptions
// Finding consumptions for J3's packages
const j3PackageIds = new Set(packages.map(p => p.id));
const consumptions = data.tables.package_consumptions.rows.filter(pc => 
    j3PackageIds.has(pc.package_id) || j3PackageIds.has(pc.client_package_id)
);
const consumed = consumptions.reduce((sum, pc) => sum + Number(pc.quantity), 0);

console.log('--- J3 Supabase State ---');
console.log(`Initial/Linked: ${initial}`);
console.log(`Invisible Reloads: ${reloads}`);
console.log(`Acquired Total: ${initial + reloads}`);
console.log(`Consumed: ${consumed}`);
console.log(`Balance: ${initial + reloads - consumed}`);
