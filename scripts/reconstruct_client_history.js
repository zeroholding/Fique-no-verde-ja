const fs = require('fs');
const path = require('path');

// Backup directory from Step 15985/15988
const BACKUP_DIR = 'c:\\Users\\Micro\\Desktop\\GIANLUCA TRABALHO\\Fique-no-verde-ja\\backups\\2026-02-18T12-57-34-962Z';
const CLIENT_ID = '06868111-62d1-41cd-8ad0-154e3b23cf53';

function readJsonResult(filename) {
    try {
        const filePath = path.join(BACKUP_DIR, filename);
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            return [];
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error(`Error reading ${filename}:`, e.message);
        return [];
    }
}

async function run() {
    console.log(`--- Reconstructing History for Client: ${CLIENT_ID} ---\n`);

    // 1. Load Data
    const sales = readJsonResult('sales.json');
    const saleItems = readJsonResult('sale_items.json');
    const consumptions = readJsonResult('package_consumptions.json');
    const clients = readJsonResult('clients.json');

    const clientName = clients.find(c => c.id === CLIENT_ID)?.name || 'Unknown';
    console.log(`Client Name: ${clientName}`);

    // 2. Filter Purchases (Type 02)
    // We need to join Sales with SaleItems to get Quantity
    const clientSales = sales.filter(s => s.client_id === CLIENT_ID && s.status !== 'cancelada');
    const purchaseOps = [];

    for (const sale of clientSales) {
        // Find items for this sale
        const items = saleItems.filter(i => i.sale_id === sale.id && i.sale_type === '02');
        for (const item of items) {
             purchaseOps.push({
                 date: new Date(sale.sale_date),
                 type: 'COMPRA',
                 quantity: Number(item.quantity),
                 value: Number(item.total),
                 unit_price: Number(item.unit_price),
                 id: sale.id
             });
        }
    }

    // 3. Filter Consumptions
    // Need to find package_id for this client? Or just trust the backup logic
    // Consumptions in backup are ALL consumptions. We need to filter by client.
    // Wait, package_consumptions doesn't have client_id directly, it links to package_id -> client_id.
    // But we verified in step 16077 that this client has ONE package: "dbc7a49c-cd31-4be2-a818-3e35966feae8"
    const PACKAGE_ID = "dbc7a49c-cd31-4be2-a818-3e35966feae8"; 
    
    // Check if there are other packages? Step 16077 showed only 1 in array.
    // Let's assume 1 for now or check package list if available (we have client_packages.json too)
    const packages = readJsonResult('client_packages.json');
    const clientPackageIds = packages.filter(p => p.client_id === CLIENT_ID).map(p => p.id);

    const clientConsumptions = consumptions.filter(c => clientPackageIds.includes(c.package_id));
    
    const consumptionOps = clientConsumptions.map(c => ({
        date: new Date(c.consumed_at),
        type: 'CONSUMO',
        quantity: -Number(c.quantity), // Negative for consumption
        value: -Number(c.total_value),
        unit_price: Number(c.unit_price),
        id: c.id
    }));

    // 4. Merge and Sort
    const allOps = [...purchaseOps, ...consumptionOps].sort((a, b) => a.date - b.date);

    // 5. Calculate Running Balance
    let runningQty = 0;
    let runningTotalPaid = 0;

    console.table(allOps.map(op => {
        runningQty += op.quantity;
        if (op.type === 'COMPRA') runningTotalPaid += op.value;
        
        return {
            Date: op.date.toISOString().slice(0, 19).replace('T', ' '),
            Type: op.type,
            Qty: op.quantity,
            Price: op.unit_price.toFixed(2),
            Total: op.value.toFixed(2),
            'Balance (Qty)': runningQty
        };
    }));

    console.log(`\nFinal Calculated Balance: ${runningQty}`);
    
    // Check against current state
    const currentPkg = packages.find(p => p.id === PACKAGE_ID);
    console.log(`\nCurrent Database State (Package ${PACKAGE_ID}):`);
    console.log(`- Available: ${currentPkg?.available_quantity}`);
    console.log(`- Initial: ${currentPkg?.initial_quantity}`);
    console.log(`- Consumed: ${currentPkg?.consumed_quantity}`);
    
    const calculatedAvailable = Number(currentPkg?.initial_quantity) - Number(currentPkg?.consumed_quantity);
    console.log(`- Math Check (Initial - Consumed): ${calculatedAvailable}`);
}

run();
