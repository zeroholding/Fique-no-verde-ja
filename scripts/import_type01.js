const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';
const client = new Client({ connectionString: coolifyConn, ssl: false });

const normalize = (str) => str ? str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

async function runImport() {
  await client.connect();
  console.log("=== TYPE 01 SALES IMPORT WITH AUTO-CLIENT ===");

  try {
      // 1. Fetch Users
      const usersRes = await client.query('SELECT id, first_name, last_name, email FROM users');
      const userMap = new Map();
      usersRes.rows.forEach(u => {
          const fullName = `${u.first_name} ${u.last_name || ''}`.trim();
          userMap.set(normalize(u.first_name), u.id);
          userMap.set(normalize(fullName), u.id);
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

      // 2. Fetch Services
      const servicesRes = await client.query('SELECT id, name FROM services');
      const serviceMap = new Map();
      servicesRes.rows.forEach(s => serviceMap.set(normalize(s.name), s.id));

      // 3. Fetch Existing Clients
      const clientsRes = await client.query('SELECT id, name FROM clients');
      const clientMap = new Map();
      clientsRes.rows.forEach(c => clientMap.set(normalize(c.name), c.id));
      
      console.log(`Loaded: ${usersRes.rowCount} users, ${servicesRes.rowCount} services, ${clientsRes.rowCount} clients.`);

      // 4. Read CSV
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
      if (rawLines.length < 2) {
          console.log("No data found."); return;
      }

      const headers = rawLines[0].split(',').map(h => normalize(h.replace(/"/g, '')));
      const getIdx = (name) => headers.findIndex(h => h === normalize(name));
      
      const idxData = [getIdx('DATA DA VENDA'), getIdx('Created'), getIdx('data')].find(i => i !== -1);
      const idxTotal = getIdx('TOTAL DA VENDA');
      const idxSubtotal = getIdx('SUBTOTAL');
      const idxDiscountVal = getIdx('DESCONTO TOTAL [$]') !== -1 ? getIdx('DESCONTO TOTAL [$]') : getIdx('Desconto $');
      const idxQtde = getIdx('QTDE') || getIdx('Quantidade');
      const idxProduct = getIdx('SERVIÇO') || getIdx('Produto');
      const idxClient = getIdx('Cliente');
      const idxAttendant = getIdx('ATENDENTE USUARIO') || getIdx('Colaborador');
      const idxPayment = getIdx('FORMA PGTO') || getIdx('Forma de Pagamento');
      const idxObs = getIdx('Observação');

      const salesToInsert = [];
      const itemsToInsert = [];
      let clientsCreatedCount = 0;

      await client.query('BEGIN'); // Start Transaction

      for (let i = 1; i < rawLines.length; i++) {
          const line = rawLines[i];
          const pattern = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/; 
          const cols = line.split(pattern).map(c => c ? c.trim().replace(/^"|"$/g, '') : '');
          const getVal = (idx) => idx !== -1 && cols[idx] ? cols[idx] : null;

          const clientStr = getVal(idxClient);
          if (!clientStr || !clientStr.trim()) continue;

          // Resolve Client (Auto-Create if Missing)
          let clientId = clientMap.get(normalize(clientStr));
          if (!clientId) {
               const cleanName = normalize(clientStr).replace(/\s+/g, ' ');
               clientId = clientMap.get(cleanName);
          }

          if (!clientId) {
              const newName = clientStr.trim();
              const insertRes = await client.query(
                  `INSERT INTO clients (id, name, client_type, created_at, updated_at) VALUES ($1, $2, 'common', NOW(), NOW()) RETURNING id`,
                  [uuidv4(), newName]
              );
              clientId = insertRes.rows[0].id;
              clientMap.set(normalize(newName), clientId);
              clientsCreatedCount++;
          }

          // Resolve Attendant
          const attendantStr = getVal(idxAttendant);
          const attendantKey = attendantStr ? attendantStr.toUpperCase().trim() : "";
          let attendantEmail = emailMap[attendantKey];
          
          let attendantId = null;
          if (attendantEmail) {
              const user = usersRes.rows.find(u => u.email === attendantEmail);
              if (user) attendantId = user.id;
          }
          if (!attendantId) {
              attendantId = userMap.get(normalize(attendantStr)) || null;
          }
          if (!attendantId) {
               attendantId = usersRes.rows[0]?.id; // Fallback
          }

          // Resolve Service
          const productStr = getVal(idxProduct);
          let serviceId = serviceMap.get(normalize(productStr)) || null;

          // Parse Values
          const parseFloatSafe = (str) => {
              if (!str) return 0;
              let clean = str.replace(/[R$\s]/g, '');
              const lastDot = clean.lastIndexOf('.');
              const lastComma = clean.lastIndexOf(',');
              if (lastComma > lastDot) clean = clean.replace(/\./g, '').replace(',', '.');
              else clean = clean.replace(/,/g, '');
              return parseFloat(clean) || 0;
          };

          const total = parseFloatSafe(getVal(idxTotal));
          const discount = parseFloatSafe(getVal(idxDiscountVal));
          const subtotal = parseFloatSafe(getVal(idxSubtotal));
          const quantity = parseFloatSafe(getVal(idxQtde)) || 1;
          let unitPrice = quantity > 0 ? (subtotal / quantity) : subtotal;

          // Parse Date
          const dateStr = getVal(idxData);
          let saleDate = new Date();
          if (dateStr) {
              const datePart = dateStr.split(' ')[0];
              const parts = datePart.split('/'); // Default assumes MM/DD/YYYY from Sheets
              if (parts.length === 3) {
                  // Usually day is > 12 if DD/MM, handle properly
                  let day, month;
                  if (parseInt(parts[0], 10) > 12) {
                       day = parseInt(parts[0], 10);
                       month = parseInt(parts[1], 10) - 1;
                  } else { // Assume American format as in previous CSV
                       month = parseInt(parts[0], 10) - 1;
                       day = parseInt(parts[1], 10);
                  }
                  const year = parseInt(parts[2], 10);
                  saleDate = new Date(year, month, day, 12, 0, 0); 
              }
          }
          
          const paymentStr = getVal(idxPayment);
          const paymentMethod = paymentStr ? paymentStr.toLowerCase().replace(/ /g, '_') : 'outros';
          const saleId = uuidv4();
          
          salesToInsert.push({
              id: saleId,
              client_id: clientId,
              attendant_id: attendantId,
              total: total,
              total_discount: discount,
              subtotal: subtotal,
              general_discount_value: discount,
              general_discount_type: 'fixed',
              payment_method: paymentMethod,
              sale_date: saleDate.toISOString(),
              created_at: new Date().toISOString(),
              status: 'confirmada',
              observations: getVal(idxObs) || null
          });

          const itemSubtotal = subtotal || (unitPrice * quantity);
          itemsToInsert.push({
              sale_id: saleId,
              product_id: null,
              product_name: productStr || "Produto Indefinido",
              quantity: quantity,
              unit_price: unitPrice,
              subtotal: itemSubtotal,
              total: itemSubtotal,
              sale_type: '01' // TIPO 01 AS REQUESTED
          });
      }

      console.log(`\nImporting ${salesToInsert.length} sales via type 01.`);

      // Batch Insert Sales
      for (const sale of salesToInsert) {
          await client.query(`
              INSERT INTO sales 
              (id, client_id, attendant_id, total, total_discount, subtotal, general_discount_value, general_discount_type, payment_method, sale_date, created_at, status, observations)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `, [sale.id, sale.client_id, sale.attendant_id, sale.total, sale.total_discount, sale.subtotal, sale.general_discount_value, sale.general_discount_type, sale.payment_method, sale.sale_date, sale.created_at, sale.status, sale.observations]);
      }

      // Batch Insert Items
      for (const item of itemsToInsert) {
          await client.query(`
              INSERT INTO sale_items 
              (sale_id, product_id, product_name, quantity, unit_price, subtotal, total, sale_type)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [item.sale_id, item.product_id, item.product_name, item.quantity, item.unit_price, item.subtotal, item.total, item.sale_type]);
      }

      await client.query('COMMIT');
      console.log("\n✅ Import Complete!");
      console.log(`- Auto-Created Clients: ${clientsCreatedCount}`);
      console.log(`- Sales Inserted: ${salesToInsert.length}`);
      console.log(`- Items Inserted: ${itemsToInsert.length}`);

  } catch (e) {
      await client.query('ROLLBACK');
      console.error("❌ Import Failed. Rolled back.", e);
  } finally {
      await client.end();
  }
}

runImport();
