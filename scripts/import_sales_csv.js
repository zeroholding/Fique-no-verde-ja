const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Manually load env vars
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

async function importSales() {
  console.log("Starting Sales Import...");

  // 1. Fetch Dependencies (Users, Services) - Clients fetched on demand or cached map
  console.log("Fetching Users and Services...");
  
  const { data: usersData } = await supabase.from('users').select('id, first_name, last_name, email');
  const { data: servicesData } = await supabase.from('services').select('id, name');
  
  // Create Lookup Maps
  // Normalize names for fuzzy match
  const normalize = (str) => str ? str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

  const userMap = new Map();
  if (usersData) {
      usersData.forEach(u => {
          const fullName = `${u.first_name} ${u.last_name || ''}`.trim();
          userMap.set(normalize(u.first_name), u.id); // First name match
          userMap.set(normalize(fullName), u.id); // Full name match
          if (u.last_name) userMap.set(normalize(u.last_name), u.id);
          // Also map strict full name from DB
          userMap.set(normalize(`${u.first_name} ${u.last_name}`), u.id);
      });
  }

  const serviceMap = new Map();
  if (servicesData) {
      servicesData.forEach(s => {
          serviceMap.set(normalize(s.name), s.id);
      });
  }

  // Pre-fetch all clients to build a map (recursive pagination)
  console.log("Fetching Clients...");
  let allClients = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  
  while (true) {
      const { data, error } = await supabase.from('clients').select('id, name').range(from, from + PAGE_SIZE - 1);
      if (error) {
          console.error("Error fetching clients page:", error);
          break;
      }
      if (!data || data.length === 0) break;
      
      allClients = allClients.concat(data);
      console.log(`Fetched ${data.length} clients (Total: ${allClients.length})...`);
      
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
  }
  
  const clientMap = new Map();
  allClients.forEach(c => {
      clientMap.set(normalize(c.name), c.id);
  });
  console.log(`Loaded ${clientMap.size} clients for lookup.`);

  // 2. Read CSV (Handle Multiline)
  const filePath = path.join(__dirname, 'BD VENDAS FNVJ - 20251203(Vendas 202501 - 202511).csv');
  console.log(`Reading file: ${filePath}`);
  const fileContent = fs.readFileSync(filePath, { encoding: 'latin1' }); 
  
  // Custom CSV Parser that handles newlines in quotes
  const parseCSV = (content) => {
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
  };
  
  const rawLines = parseCSV(fileContent);

  if (rawLines.length < 2) {
      console.error("CSV empty.");
      return;
  }

  // 3. Parse Header
  const headerLine = rawLines[0];
  const headers = headerLine.split(',').map(h => normalize(h.replace(/"/g, '')));
  
  const getIdx = (name) => headers.findIndex(h => h === normalize(name));
  
  const idxData = [getIdx('data'), getIdx('DATA DA VENDA'), getIdx('Data Ajustada'), getIdx('Created')].find(i => i !== -1);
  const idxTotal = getIdx('TOTAL DA VENDA');
  const idxSubtotal = getIdx('SUBTOTAL');
  const idxDiscountVal = getIdx('DESCONTO TOTAL [$]');
  const idxQtde = getIdx('QTDE');
  const idxProduct = getIdx('Produto');
  const idxClient = getIdx('Cliente');
  const idxAttendant = getIdx('Colaborador');
  const idxPayment = getIdx('Forma de Pagamento') !== -1 ? getIdx('Forma de Pagamento') : getIdx('FORMA PGTO');

  console.log("Column Mapping:", { idxData, idxTotal, idxSubtotal, idxDiscountVal, idxQtde, idxProduct, idxClient, idxAttendant, idxPayment });

  const { v4: uuidv4 } = require('uuid');

  const salesToInsert = [];
  const itemsToInsert = [];
  
  let missingClient = 0;
  let missingProduct = 0;

  for (let i = 1; i < rawLines.length; i++) {
      const line = rawLines[i];
      // Helper to split by comma respecting quotes
      const pattern = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/; 
      const cols = line.split(pattern).map(c => c ? c.trim().replace(/^"|"$/g, '') : '');

      const getVal = (idx) => idx !== -1 && cols[idx] ? cols[idx] : null;

      const dateStr = getVal(idxData);
      const totalStr = getVal(idxTotal);
      const discountStr = getVal(idxDiscountVal);
      const subtotalStr = getVal(idxSubtotal);
      const qtdeStr = getVal(idxQtde) || getVal(getIdx('Quantidade'));
      const productStr = getVal(idxProduct);
      const clientStr = getVal(idxClient);
      const attendantStr = getVal(idxAttendant);
      const paymentStr = getVal(idxPayment);

      if (!clientStr) continue;

      // 1. Resolve Client
      // Try strict, then fuzzy
      let clientId = clientMap.get(normalize(clientStr));
      if (!clientId) {
           // Try extra cleaning (remove extra spaces)
           const cleanName = normalize(clientStr).replace(/\s+/g, ' ');
           clientId = clientMap.get(cleanName);
      }

      if (!clientId) {
          missingClient++;
          if (missingClient <= 5) console.log(`[DEBUG] Client not found: '${clientStr}'`);
          continue; 
      }

      // 2. Resolve Product/Service (Optional now)
      let serviceId = serviceMap.get(normalize(productStr)) || null;
      if (!serviceId) missingProduct++;
      
      let productName = productStr;

      // 3. Resolve Attendant via Email Map
      const emailMap = {
          "ANA SANTOS": "ana@gmail.com",
          "EVELLYN PRADO": "evellyn@gmail.com",
          "OUTROS .": "outros@gmail.com", // Check if exists, otherwise fallback
          "BRUNA CASTRO": "bcastro.bc14@outlook.com",
          "MARIA VITORIA": "viviistatkevicius@gmail.com", // Normalized key
          "MARIA VITÓRIA": "viviistatkevicius@gmail.com",
          "BEATRIZ": "bia37807@outlook.com",
          "LAIS": "laismrd93@gmail.com",
          "LAÍS": "laismrd93@gmail.com"
      };

      const attendantKey = attendantStr ? attendantStr.toUpperCase().trim() : "";
      let attendantEmail = emailMap[attendantKey];
      
      // Fallback: try raw name match in userMap
      let attendantId = null;
      
      if (attendantEmail) {
          // Find user by email (we didn't load emails into map efficiently, let's fix userMap or just find in array)
          // Ideally userMap should map email -> id too
          // Quick fix: loop usersData
          const user = usersData.find(u => u.email === attendantEmail);
          if (user) attendantId = user.id;
      }
      
      if (!attendantId) {
          attendantId = userMap.get(normalize(attendantStr)) || null;
      }

      // 4. Parse Values
      const parseFloatSafe = (str) => {
          if (!str) return 0;
          // Clean currency and spaces
          let clean = str.replace(/[R$\s]/g, '');
          
          // Check format
          // If 1,500.00 (US) -> . is last, , is present
          // If 1.500,00 (BR) -> , is last, . is present
          const lastDot = clean.lastIndexOf('.');
          const lastComma = clean.lastIndexOf(',');

          if (lastComma > lastDot) {
              // BR Format: 1.500,00 -> remove dots, replace comma with dot
              clean = clean.replace(/\./g, '').replace(',', '.');
          } else {
              // US Format or plain: 1,500.00 -> remove commas
              clean = clean.replace(/,/g, '');
          }
          
          return parseFloat(clean) || 0;
      };

      const total = parseFloatSafe(totalStr);
      const discount = parseFloatSafe(discountStr);
      const subtotal = parseFloatSafe(subtotalStr);
      const quantity = parseFloatSafe(qtdeStr) || 1;

      let unitPrice = quantity > 0 ? (subtotal / quantity) : subtotal;

      // 5. Parse Date (DD/MM/YYYY)
      let createdAt = new Date();
      let saleDate = new Date();
      if (dateStr) {
          // Remove time if present "1/6/2025 6:05" -> "1/6/2025"
          const datePart = dateStr.split(' ')[0];
          const parts = datePart.split('/');
          if (parts.length === 3) {
             // Assume DD/MM/YYYY
             const day = parseInt(parts[0], 10);
             const month = parseInt(parts[1], 10) - 1; // JS Month is 0-indexed
             const year = parseInt(parts[2], 10);
             
             // Create date object (Local time to avoid timezone shifts if possible, or UTC)
             // Using UTC strings for DB is safer
             saleDate = new Date(year, month, day, 12, 0, 0); // Noon to avoid boundary issues
             createdAt = saleDate;
          }
      }
      
      const saleNumber = parseInt(getVal(0), 10);
      
      // Fallback for attendant
      let finalAttendantId = attendantId;
      if (!finalAttendantId) {
           // Default to first user in map or specific default?
           // Use the first user found as fallback
           finalAttendantId = usersData[0]?.id;
      }

      const saleId = uuidv4();
      
      salesToInsert.push({
          id: saleId,
          // sale_number: saleNumber, // sequence
          client_id: clientId,
          attendant_id: finalAttendantId,
          total: total,
          total_discount: discount,
          subtotal: subtotal, // Save subtotal too if column exists in DB? Yes.
          general_discount_value: discount, // Assuming general discount
          general_discount_type: 'fixed',
          payment_method: paymentStr ? paymentStr.toLowerCase().replace(/ /g, '_') : 'outros', // normalize payment method?
          sale_date: saleDate.toISOString(), // Save the actual sale date
          created_at: new Date().toISOString(), // Created now, but sale_date is retro
          status: 'confirmada',
          observations: getVal(getIdx('Observação'))
      });

      // Item total logic
      // Unit Price: calculated
      // Total: Subtotal (since discount is already applied at sale level or 0 item discount)
      const itemSubtotal = subtotal || (unitPrice * quantity);
      
      itemsToInsert.push({
          sale_id: saleId,
          product_id: null,
          product_name: productName || "Produto Indefinido",
          quantity: quantity,
          unit_price: unitPrice,
          subtotal: itemSubtotal,
          total: itemSubtotal,
          sale_type: '01'
      });
  }

  console.log(`\nPrepared ${salesToInsert.length} sales.`);
  console.log(`Missing Clients: ${missingClient}`);
  console.log(`Missing Products: ${missingProduct}`);

  if (salesToInsert.length === 0) {
      console.log("Nothing to insert.");
      return;
  }

  // Insert Batches
  console.log("Inserting Sales...");
  const BATCH_SIZE = 100;
  for (let i = 0; i < salesToInsert.length; i += BATCH_SIZE) {
      const batch = salesToInsert.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('sales').insert(batch);
      if (error) {
          console.error(`FATAL ERROR inserting sales batch ${i}:`, error.message);
          console.error("First item in failed batch:", batch[0]);
          process.exit(1);
      } else {
          process.stdout.write('.');
      }
  }

  // Update Sequence
  console.log("\nUpdating Sequence...");
  const { error: seqError } = await supabase.rpc('exec_sql', { 
      query: "SELECT setval('sales_sale_number_seq', (SELECT MAX(sale_number) FROM sales))" 
  });
  if (seqError) console.error("Error updating sequence:", seqError);
  
  console.log("\nInserting Sale Items...");
  for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
      const batch = itemsToInsert.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('sale_items').insert(batch);
      if (error) {
          console.error(`Error inserting items batch ${i}:`, error.message);
      } else {
          process.stdout.write('.');
      }
  }

  console.log("\nDone!");
}

importSales();
