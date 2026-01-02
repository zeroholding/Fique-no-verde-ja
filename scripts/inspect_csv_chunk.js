const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'BD VENDAS FNVJ - 20251203(Vendas 202501 - 202511).csv');
const content = fs.readFileSync(filePath, { encoding: 'latin1' });

const idx = content.indexOf('BOX7 CLAYTON');
if (idx === -1) {
    console.log("String not found.");
} else {
    // Show 100 chars before and after
    const start = Math.max(0, idx - 100);
    const end = Math.min(content.length, idx + 100);
    const chunk = content.substring(start, end);
    console.log("--- CHUNK ---");
    console.log(JSON.stringify(chunk));
    console.log("-------------");
}
