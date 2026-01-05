const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'BD VENDAS FNVJ - 20251203(Vendas 202501 - 202511).csv');
const content = fs.readFileSync(filePath, { encoding: 'latin1' });

// Show header
const lines = content.split('\n');
console.log("=== HEADER ===");
console.log(lines[0].split(',').slice(0, 10).join(' | '));

// Check lines around line 20-30 for date formats
console.log("\n=== PRIMEIRAS 5 LINHAS DE DADOS ===");
for (let i = 1; i <= 5 && i < lines.length; i++) {
    const cols = lines[i].split(',');
    console.log(`Linha ${i}: [Data="${cols[6]}", Cliente="${cols[3]}", Servico="${cols[7]}"]`);
}

// Search for "6/1/2025" or "1/6/2025" pattern (Jan 6th)
console.log("\n=== BUSCA POR DIA 06 JANEIRO ===");
let count = 0;
for (let i = 1; i < lines.length && count < 10; i++) {
    const line = lines[i];
    // Check for 6/1/2025 or 1/6/2025
    if (line.includes('6/1/2025') || line.includes('1/6/2025') || line.includes('06/01/2025') || line.includes('01/06/2025')) {
        console.log(`Linha ${i}: ${line.slice(0, 150)}...`);
        count++;
    }
}

// Check for dates with /27 or 2027
console.log("\n=== BUSCA POR 2027 ===");
count = 0;
for (let i = 1; i < lines.length && count < 5; i++) {
    const line = lines[i];
    if (line.includes('/27') || line.includes('2027')) {
        console.log(`Linha ${i}: ${line.slice(0, 150)}...`);
        count++;
    }
}
