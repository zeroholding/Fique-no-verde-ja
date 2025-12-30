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

  // Pre-fetch all clients to build a map (assuming ~2000 clients fits in memory easily)
  console.log("Fetching Clients...");
  const { data: clientsData, error: clientErr } = await supabase.from('clients').select('id, name');
  if (clientErr) {
      console.error("Error fetching clients:", clientErr);
      return;
  }
  
  const clientMap = new Map();
  clientsData.forEach(c => {
      clientMap.set(normalize(c.name), c.id);
  });
  console.log(`Loaded ${clientMap.size} clients for lookup.`);

  // 2. Read CSV (Handle Multiline)
  const filePath = path.join(__dirname, '../BDVENDAS.csv');
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
  
  const idxData = getIdx('data');
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
      
      // If service not found, check products table fallback OR just use text name
      // We will use serviceId if found (for better linking), else null.

      // 3. Resolve Attendant
      const attendantId = userMap.get(normalize(attendantStr)) || null;

      // 4. Parse Values
      const parseFloatSafe = (str) => {
          if (!str) return 0;
          str = str.replace(/[^\d.,-]/g, ''); // Remove currency symbols
          // If 1.000,00 format -> 1000.00
          // If 1000.00 format -> 1000.00
          // Heuristic: if comma is last separator, it's decimal.
          if (str.includes(',') && str.lastIndexOf(',') > str.lastIndexOf('.')) {
             str = str.replace(/\./g, '').replace(',', '.');
          }
          return parseFloat(str) || 0;
      };

      const total = parseFloatSafe(totalStr);
      const discount = parseFloatSafe(discountStr);
      const subtotal = parseFloatSafe(subtotalStr);
      const quantity = parseFloatSafe(qtdeStr) || 1;

      let unitPrice = quantity > 0 ? (subtotal / quantity) : subtotal;

      // 5. Parse Date
      let createdAt = new Date();
      if (dateStr) {
          const parts = dateStr.split(' ')[0].split('/');
          if (parts.length === 3) {
             // MM/DD/YYYY to YYYY-MM-DD
             createdAt = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
          }
      }
      const saleNumber = parseInt(getVal(0), 10);
      if (isNaN(saleNumber)) {
          // console.log(`[DEBUG] Skipping line ${i}: Invalid Sale Number (ID): '${getVal(0)}'`);
          // Actually, we process anyway because we don't use saleNumber for insert anymore.
          // continue;
      }
      
      // Fallback for attendant
      let finalAttendantId = attendantId;
      if (!finalAttendantId) {
           // Default to first user in map
           finalAttendantId = userMap.values().next().value;
      }

      const saleId = uuidv4();
      
      salesToInsert.push({
          id: saleId,
          // sale_number: saleNumber, // Omitted to use sequence
          client_id: clientId,
          attendant_id: finalAttendantId,
          total: total,
          total_discount: discount,
          payment_method: paymentStr || 'outros',
          created_at: createdAt.toISOString(),
          status: 'confirmada'
      });

      const itemSubtotal = subtotal || (unitPrice * quantity);
      
      itemsToInsert.push({
          sale_id: saleId,
          product_id: null,
          product_name: productName || "Produto Indefinido",
          quantity: quantity,
          unit_price: unitPrice,
          subtotal: itemSubtotal,
          total: itemSubtotal, // Assuming total for item is subtotal (discount is at sale level generally, or item level?) 
          // If CSV has item discount, we should use it. 
          // CSV has "DESCONTO TOTAL [$]" at SALE level.
          // So item total = subtotal.
          sale_type: '01' // Common sale (belongs to item?)
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
