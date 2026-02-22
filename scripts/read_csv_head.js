const fs = require('fs');

try {
    const fileContent = fs.readFileSync('C:\\Users\\Micro\\Desktop\\GIANLUCA TRABALHO\\Fique-no-verde-ja\\BD VENDAS FNVJ - 202512 - TIPO 01(Vendas 202501 - 202511).csv', 'latin1');
    const lines = fileContent.split('\n');
    console.log("=== HEADERS ===");
    console.log(lines[0]);
    console.log("\n=== FIRST DOS LINES ===");
    console.log(lines[1]);
    console.log(lines[2]);
    console.log(lines[3]);
    console.log(lines[4]);
} catch (e) {
    console.error(e);
}
