const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const parseEnv = (key) => {
  const regex = new RegExp(`${key}=["']?([^"'\n]+)["']?`);
  const match = envContent.match(regex);
  return match ? match[1] : null;
};

const supabaseUrl = parseEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseServiceKey = parseEnv('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const normalize = (str) => str ? str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

async function simulateImport() {
  console.log("=== DRY RUN: TYPE 01 SALES IMPORT ===");

  // 1. Fetch Lookups
  const { data: usersData } = await supabase.from('users').select('id, first_name, last_name, email');
  const { data: servicesData } = await supabase.from('services').select('id, name');
  
  const userMap = new Map();
  if (usersData) {
      usersData.forEach(u => {
          const fullName = `${u.first_name} ${u.last_name || ''}`.trim();
          userMap.set(normalize(u.first_name), u.id);
          userMap.set(normalize(fullName), u.id);
      });
  }

  const serviceMap = new Map();
  if (servicesData) {
      servicesData.forEach(s => serviceMap.set(normalize(s.name), s.id));
  }

  let allClients = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  while (true) {
      const { data, error } = await supabase.from('clients').select('id, name').range(from, from + PAGE_SIZE - 1);
      if (!data || data.length === 0) break;
      allClients = allClients.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
  }
  const clientMap = new Map();
  allClients.forEach(c => clientMap.set(normalize(c.name), c.id));
  console.log(`Loaded Lookups: ${clientMap.size} clients, ${userMap.size} users (keys), ${serviceMap.size} services`);

  // 2. Read CSV
  const filePath = path.join(__dirname, '../BD VENDAS FNVJ - 202512 - TIPO 01(Vendas 202501 - 202511).csv');
  const fileContent = fs.readFileSync(filePath, { encoding: 'latin1' }); 
  
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
  
  const rawLines = parseCSV(fileContent);
  const headers = rawLines[0].split(',').map(h => normalize(h.replace(/"/g, '')));
  const getIdx = (name) => headers.findIndex(h => h === normalize(name));
  
  const idxData = [getIdx('DATA DA VENDA'), getIdx('data')].find(i => i !== -1);
  const idxTotal = getIdx('TOTAL DA VENDA');
  const idxSubtotal = getIdx('SUBTOTAL');
  const idxDiscountVal = getIdx('DESCONTO TOTAL [$]');
  const idxQtde = getIdx('QTDE') || getIdx('Quantidade');
  const idxProduct = getIdx('SERVIÇO') || getIdx('Produto');
  const idxClient = getIdx('Cliente');
  const idxAttendant = getIdx('ATENDENTE USUARIO') || getIdx('Colaborador');
  const idxPayment = getIdx('FORMA PGTO') || getIdx('Forma de Pagamento');

  let missingClientsToCreate = new Set();
  let salesCount = 0;

  for (let i = 1; i < rawLines.length; i++) {
      const line = rawLines[i];
      const pattern = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/; 
      const cols = line.split(pattern).map(c => c ? c.trim().replace(/^"|"$/g, '') : '');
      const getVal = (idx) => idx !== -1 && cols[idx] ? cols[idx] : null;

      const clientStr = getVal(idxClient);
      if (!clientStr) continue;

      let clientId = clientMap.get(normalize(clientStr));
      if (!clientId) {
           const cleanName = normalize(clientStr).replace(/\s+/g, ' ');
           clientId = clientMap.get(cleanName);
      }

      if (!clientId) {
          missingClientsToCreate.add(clientStr.trim());
      }
      salesCount++;
  }

  console.log(`\n--- DRY RUN RESULTS ---`);
  console.log(`Total Sales to Import: ${salesCount}`);
  console.log(`Missing Clients to Auto-Create: ${missingClientsToCreate.size}`);
  
  if (missingClientsToCreate.size > 0) {
      console.log("\nSample of Clients to be created:");
      let idx = 0;
      for (const name of missingClientsToCreate) {
          console.log(` - ${name}`);
          if (++idx >= 10) break;
      }
      if (missingClientsToCreate.size > 10) console.log(`   ...and ${missingClientsToCreate.size - 10} more.`);
  }

}

simulateImport();
