const fs = require('fs');

function parseCSV(content) {
  const rows = [];
  let currentRow = '';
  let insideQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
      const char = content[i];
      if (char === '"') {
          insideQuotes = !insideQuotes;
      }
      if ((char === '\n' || char === '\r') && !insideQuotes) {
          if (currentRow.trim()) rows.push(currentRow);
          currentRow = '';
      } else {
          currentRow += char;
      }
  }
  if (currentRow.trim()) rows.push(currentRow);
  return rows;
}

try {
    const fileContent = fs.readFileSync('C:\\Users\\Micro\\Desktop\\GIANLUCA TRABALHO\\Fique-no-verde-ja\\BD VENDAS FNVJ - 202512 - TIPO 01(Vendas 202501 - 202511).csv', 'latin1');
    const lines = parseCSV(fileContent);
    
    if (lines.length < 2) {
       console.log("Empty or invalid CSV");
       process.exit();
    }
    
    const pattern = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/; 
    const headers = lines[0].split(pattern).map(h => h.trim().replace(/^"|"$/g, ''));
    
    console.log("=== HEADERS ===");
    headers.forEach((h, i) => console.log(`[${i}] ${h}`));
    
    console.log("\n=== ROW 1 ===");
    const row1 = lines[1].split(pattern).map(c => c ? c.trim().replace(/^"|"$/g, '') : '');
    headers.forEach((h, i) => {
        console.log(`${h}: ${row1[i]}`);
    });

} catch (e) {
    console.error(e);
}
