const fs = require('fs');

try {
    const fileContent = fs.readFileSync('C:\\Users\\Micro\\Desktop\\GIANLUCA TRABALHO\\Fique-no-verde-ja\\BD VENDAS FNVJ - 202512 - TIPO 03(Planilha2).csv', 'latin1');
    
    const parseCSV = (content) => {
        const rows = []; let currentRow = ''; let insideQuotes = false;
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            if (char === '"') insideQuotes = !insideQuotes;
            if ((char === '\n' || char === '\r') && !insideQuotes) {
                if (currentRow.trim()) rows.push(currentRow); currentRow = '';
            } else currentRow += char;
        }
        if (currentRow.trim()) rows.push(currentRow);
        return rows;
    };
    
    const lines = parseCSV(fileContent);
    if (lines.length < 2) {
       console.log("Empty or invalid CSV");
       process.exit();
    }
    
    const pattern = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/; 
    const normalize = (str) => str ? str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
    const headers = lines[0].split(pattern).map(h => normalize(h.replace(/"/g, '')));
    
    const idxClient = headers.findIndex(h => h === 'cliente' || h.includes('transportadora'));
    const idxQty = headers.findIndex(h => h === 'quantidade' || h === 'qtde');
    
    console.log(`Using Client Column index: ${idxClient} (${lines[0].split(pattern)[idxClient]})`);
    console.log(`Using Qty Column index: ${idxQty} (${lines[0].split(pattern)[idxQty]})`);

    const totals = {};

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(pattern).map(c => c ? c.trim().replace(/^"|"$/g, '') : '');
        
        const client = cols[idxClient];
        const qtyStr = cols[idxQty];
        
        if (!client) continue;

        const parseFloatSafe = (str) => {
            if (!str) return 0;
            let clean = str.replace(/[R$\s]/g, '');
            const lastDot = clean.lastIndexOf('.');
            const lastComma = clean.lastIndexOf(',');
            if (lastComma > lastDot) clean = clean.replace(/\./g, '').replace(',', '.');
            else clean = clean.replace(/,/g, '');
            return parseFloat(clean) || 0;
        };

        const qty = parseFloatSafe(qtyStr);
        const normalClient = client.toUpperCase().trim();

        if (!totals[normalClient]) {
            totals[normalClient] = 0;
        }
        totals[normalClient] += qty;
    }

    // Sort by name or total
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]); // Sort by highest
    
    console.log("\n--- Totais de Consumo (Tipo 03) por Transportadora ---");
    let totalGeral = 0;
    for (const [client, total] of sorted) {
        if (total > 0) {
            console.log(`${client}: ${total} consumos`);
            totalGeral += total;
        }
    }
    console.log("-----------------------------------------------------");
    console.log(`TOTAL GERAL: ${totalGeral}`);

} catch (e) {
    console.error(e);
}
