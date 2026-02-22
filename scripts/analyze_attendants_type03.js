const fs = require('fs');
const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';
const dbClient = new Client({ connectionString: coolifyConn, ssl: false });

const normalize = (str) => str ? str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

async function analyze() {
    await dbClient.connect();
    console.log("=== ANALYZING TYPE 03 ATTENDANTS ===");
    
    try {
        // 1. Fetch Users
        const usersRes = await dbClient.query('SELECT id, first_name, last_name, email FROM users');
        const userMap = new Map();
        usersRes.rows.forEach(u => {
            const fullName = `${u.first_name} ${u.last_name || ''}`.trim();
            userMap.set(normalize(u.first_name), u);
            userMap.set(normalize(fullName), u);
        });

        // Email fallback map (from legacy system)
        const emailMap = {
            "ANA SANTOS": "ana@gmail.com",
            "EVELLYN PRADO": "evellyn@gmail.com",
            "OUTROS .": "outros@gmail.com",
            "BRUNA CASTRO": "bcastro.bc14@outlook.com",
            "MARIA VITORIA": "viviistatkevicius@gmail.com",
            "MARIA VITÓRIA": "viviistatkevicius@gmail.com",
            "BEATRIZ": "bia37807@outlook.com",
            "LAIS": "laismrd93@gmail.com",
            "LAÍS": "laismrd93@gmail.com"
        };

        // 2. Read CSV
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
        const headers = lines[0].split(pattern).map(h => normalize(h.replace(/"/g, '')));
        
        const idxAttendant = headers.findIndex(h => h === 'atendente usuario' || h === 'colaborador');
        console.log(`Using Attendant Column index: ${idxAttendant} (${lines[0].split(pattern)[idxAttendant]})`);

        const attendantsFound = new Set();
        const attendantTotals = {};

        // Collect unique attendants
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(pattern).map(c => c ? c.trim().replace(/^"|"$/g, '') : '');
            const att = cols[idxAttendant];
            
            if (!att) continue;
            const attName = att.toUpperCase().trim();
            
            attendantsFound.add(attName);
            if (!attendantTotals[attName]) attendantTotals[attName] = 0;
            attendantTotals[attName]++;
        }

        const outPath = 'attendants_analysis.txt';
        fs.writeFileSync(outPath, '--- Vendedores encontrados na Planilha Tipo 03 ---\n');
        
        // Map them
        for (const attName of attendantsFound) {
            let foundDbUser = null;
            let email = emailMap[attName] || emailMap[attName.replace(' ', '')];
            if (email) foundDbUser = usersRes.rows.find(u => u.email === email);
            if (!foundDbUser) foundDbUser = userMap.get(normalize(attName));
            
            if (foundDbUser) {
                fs.appendFileSync(outPath, `✅ [FOUND] CSV: "${attName}" (${attendantTotals[attName]} vendas) -> DB: ${foundDbUser.first_name} ${foundDbUser.last_name || ''} (${foundDbUser.email})\n`);
            } else {
                fs.appendFileSync(outPath, `❌ [NOT FOUND] CSV: "${attName}" (${attendantTotals[attName]} vendas) -> NENHUM USUÁRIO ENCONTRADO NO BANCO!\n`);
            }
        }
        console.log("Analysis saved to attendants_analysis.txt");
        
    } catch (e) {
        console.error(e);
    } finally {
        await dbClient.end();
    }
}

analyze();
