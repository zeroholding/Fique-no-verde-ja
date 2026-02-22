const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';
const client = new Client({ connectionString: coolifyConn, ssl: false });

const normalize = (str) => str ? str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

async function runImportType03() {
  await client.connect();
  console.log("=== TYPE 03 SALES IMPORT (CONSUMPTIONS) ===");

  try {
      // 1. Fetch Users
      const usersRes = await client.query('SELECT id, first_name, last_name, email FROM users');
      const userMap = new Map();
      usersRes.rows.forEach(u => {
          userMap.set(u.email.toLowerCase().trim(), u.id); // Map by exact email now
      });

      // User's exact mapping
      const exactEmailMap = {
          "LAÍS SILVA MIRANDA": "laismrd93@gmail.com",
          "THALITA ALEIXO GIOLO PASSARELI": "thalitapassareli@hotmail.com",
          "LAÍSA SILVA MIRANDA": "laisaerhard@gmail.com",
          "BEATRIZ OLIVEIRA": "bia37807@outlook.com",
          "MARIA VITORIA MAGALHÃES STATKEVICIUS": "viviistatkevicius@gmail.com",
          "GUILHERME DE GOUVEIA FERREIRA": "guigf2007@gmail.com",
          "KAWAM BUENO": "kawam.bueno@gmail.com",
          "HELLEN PRADO": "pradohellen@yahoo.com.br",
          "BRUNA DE CASTRO SILVA": "bcastro.bc14@outlook.com",
          "TIM": "acessopcvictor@gmail.com"
      };

      // 2. Fetch Existing Clients (Transportadoras & Common)
      const clientsRes = await client.query('SELECT id, name FROM clients');
      const clientMap = new Map();
      clientsRes.rows.forEach(c => clientMap.set(normalize(c.name), c.id));
      
      // Fetch fallback service
      const servicesRes = await client.query("SELECT id FROM services WHERE name ILIKE '%pacote%' LIMIT 1");
      const fallbackServiceId = servicesRes.rows.length > 0 ? servicesRes.rows[0].id : null;

      // 3. Read CSV
      const filePath = path.join(__dirname, '../BD VENDAS FNVJ - 202512 - TIPO 03(Planilha2).csv');
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

      const pattern = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/; 
      const headers = rawLines[0].split(pattern).map(h => normalize(h.replace(/"/g, '')));
      const getIdx = (name) => headers.findIndex(h => h.includes(name)); // Soft match
      
      const idxData = getIdx('data');
      const idxQtde = getIdx('qtde');
      const idxClient = getIdx('transportadora');
      const idxAttendant = getIdx('atendente usuario');
      const idxProduto = getIdx('servico') || -1;

      const salesToInsert = [];
      const itemsToInsert = [];
      const consumptionsToInsert = [];
      const commissionsToInsert = [];
      const packageUpdates = new Map(); // Store net changes to each package

      await client.query('BEGIN'); // Start Transaction

      console.log(`Reading ${rawLines.length - 1} records...`);

      for (let i = 1; i < rawLines.length; i++) {
          const line = rawLines[i];
          const cols = line.split(pattern).map(c => c ? c.trim().replace(/^"|"$/g, '') : '');
          const getVal = (idx) => idx !== -1 && cols[idx] ? cols[idx] : null;

          let clientStr = getVal(idxClient);
          if (!clientStr || !clientStr.trim()) continue;
          if (clientStr.trim().toUpperCase() === 'MECONNECT') clientStr = 'MECONECT';

          // Resolve Client
          let clientId = clientMap.get(normalize(clientStr));
          if (!clientId) {
               console.log(`⚠️ Missing Client, should not happen for Type 03 (Skipping): ${clientStr}`);
               continue;
          }

          // Resolve Attendant
          const attendantStr = getVal(idxAttendant);
          const rawKey = attendantStr ? attendantStr.toUpperCase().trim() : "";
          const mappedEmail = exactEmailMap[rawKey];
          
          let attendantId = null;
          if (mappedEmail) {
              attendantId = userMap.get(mappedEmail.toLowerCase());
          }
          if (!attendantId) {
               attendantId = usersRes.rows[0]?.id; 
               console.log(`Fallback user used for: ${rawKey}`);
          }

          // Parse Quantities and Totals
          const parseFloatSafe = (str) => {
              if (!str) return 0;
              let clean = str.replace(/[R$\s]/g, '');
              const lastDot = clean.lastIndexOf('.');
              const lastComma = clean.lastIndexOf(',');
              if (lastComma > lastDot) clean = clean.replace(/\./g, '').replace(',', '.');
              else clean = clean.replace(/,/g, '');
              return parseFloat(clean) || 0;
          };

          const quantity = parseFloatSafe(getVal(idxQtde)) || 0;
          if (quantity <= 0) continue; // It's a consumption, must consume something

          // Fetch active package for this client to link the consumption and get the unit price
          const pkgsRes = await client.query(`
             SELECT id, unit_price FROM client_packages 
             WHERE client_id = $1 AND is_active = true 
             ORDER BY created_at ASC LIMIT 1
          `, [clientId]);

          let packageId = null;
          let pkgUnitPrice = 0;
          if (pkgsRes.rows.length > 0) {
              packageId = pkgsRes.rows[0].id;
              pkgUnitPrice = parseFloat(pkgsRes.rows[0].unit_price) || 0;
          }

          // Theoretical Subtotal = Quantity * Price of ONE credit. Total is 0 because the invoice was on Type 02.
          const theoreticalSubtotal = quantity * pkgUnitPrice;
          const commissionVal = theoreticalSubtotal * 0.05; // Default 5%

          // Parse Date (Retroactive to 01/12/2025 like Type 02 if CSV date fails)
          const dateStr = getVal(idxData);
          let saleDate = new Date(2025, 11, 1, 15, i % 60, i % 60); // Default to Dec 1st 2025
          if (dateStr) {
              const datePart = dateStr.split(' ')[0];
              const parts = datePart.split('/'); 
              if (parts.length === 3) {
                  let day, month;
                  if (parseInt(parts[0], 10) > 12) {
                       day = parseInt(parts[0], 10);
                       month = parseInt(parts[1], 10) - 1;
                  } else { 
                       month = parseInt(parts[0], 10) - 1;
                       day = parseInt(parts[1], 10);
                  }
                  const year = parseInt(parts[2], 10);
                  // Preserve CSV date if strictly formatted correctly
                  saleDate = new Date(year, month, day, 12, i % 60, i % 60);
              }
          }
          
          const saleId = uuidv4();
          
          salesToInsert.push({
              id: saleId,
              client_id: clientId,
              attendant_id: attendantId,
              total: 0,
              total_discount: 0,
              subtotal: theoreticalSubtotal,
              general_discount_value: 0,
              general_discount_type: 'fixed',
              payment_method: 'outros',
              sale_date: saleDate.toISOString(),
              created_at: saleDate.toISOString(),
              status: 'confirmada',
              commission_amount: commissionVal
          });

          const itemName = idxProduto !== -1 && getVal(idxProduto) ? getVal(idxProduto) : 'Pacote de Serviço Utilizado';
          const itemId = uuidv4();
          
          itemsToInsert.push({
              id: itemId,
              sale_id: saleId,
              product_id: null,
              product_name: itemName,
              quantity: quantity,
              unit_price: pkgUnitPrice,
              subtotal: theoreticalSubtotal,
              total: 0,
              sale_type: '03' // TIPO 03 AS REQUESTED (Consumo)
          });

          if (packageId) {
              consumptionsToInsert.push({
                  package_id: packageId,
                  sale_id: saleId,
                  quantity: quantity,
                  unit_price: pkgUnitPrice,
                  total_value: theoreticalSubtotal,
                  consumed_at: saleDate.toISOString()
              });

              // Track to update the balance
              if (!packageUpdates.has(packageId)) {
                  packageUpdates.set(packageId, 0);
              }
              packageUpdates.set(packageId, packageUpdates.get(packageId) + quantity);
          }

          // Generate Commission tracking explicitly
          commissionsToInsert.push({
             sale_id: saleId,
             sale_item_id: itemId,
             user_id: attendantId,
             base_amount: theoreticalSubtotal,
             commission_type: 'percentage',
             commission_rate: 5.0,
             commission_amount: commissionVal,
             reference_date: saleDate.toISOString(),
             status: 'a_pagar'
          });
      }

      console.log(`\nImporting ${salesToInsert.length} sales via type 03.`);

      // 1. Batch Insert Sales
      for (const sale of salesToInsert) {
          await client.query(`
              INSERT INTO sales 
              (id, client_id, attendant_id, total, total_discount, subtotal, general_discount_value, general_discount_type, payment_method, sale_date, created_at, status, commission_amount)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `, [sale.id, sale.client_id, sale.attendant_id, sale.total, sale.total_discount, sale.subtotal, sale.general_discount_value, sale.general_discount_type, sale.payment_method, sale.sale_date, sale.created_at, sale.status, sale.commission_amount]);
      }

      // 2. Batch Insert Items
      for (const item of itemsToInsert) {
          await client.query(`
              INSERT INTO sale_items 
              (id, sale_id, product_id, product_name, quantity, unit_price, subtotal, total, sale_type)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [item.id, item.sale_id, item.product_id, item.product_name, item.quantity, item.unit_price, item.subtotal, item.total, item.sale_type]);
      }

      // 3. Batch Insert Consumptions
      for (const cons of consumptionsToInsert) {
          await client.query(`
              INSERT INTO package_consumptions 
              (package_id, sale_id, quantity, unit_price, total_value, consumed_at)
              VALUES ($1, $2, $3, $4, $5, $6)
          `, [cons.package_id, cons.sale_id, cons.quantity, cons.unit_price, cons.total_value, cons.consumed_at]);
      }

      // 4. Batch Insert Commissions
      for (const comm of commissionsToInsert) {
          if (comm.commission_amount > 0) {
              await client.query(`
                  INSERT INTO commissions 
                  (sale_id, sale_item_id, user_id, base_amount, commission_type, commission_rate, commission_amount, reference_date, status)
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              `, [comm.sale_id, comm.sale_item_id, comm.user_id, comm.base_amount, comm.commission_type, comm.commission_rate, comm.commission_amount, comm.reference_date, comm.status]);
          }
      }

      // 5. Update Package Balances
      for (const [pkgId, qtyConsumed] of packageUpdates.entries()) {
          await client.query(`
              UPDATE client_packages
              SET 
                 available_quantity = available_quantity - $1,
                 consumed_quantity = consumed_quantity + $1,
                 updated_at = NOW()
              WHERE id = $2
          `, [qtyConsumed, pkgId]);
          console.log(`Package ${pkgId} deducted: ${qtyConsumed} credits.`);
      }

      await client.query('COMMIT');
      console.log("\n✅ Import Complete!");
      console.log(`- Type 03 Sales Inserted: ${salesToInsert.length}`);
      console.log(`- Commissions Generated: ${commissionsToInsert.filter(c => c.commission_amount > 0).length}`);
      console.log(`- Package Balances Deducted Successfully`);

  } catch (e) {
      await client.query('ROLLBACK');
      console.error("❌ Import Failed. Rolled back.", e);
  } finally {
      await client.end();
  }
}

runImportType03();
