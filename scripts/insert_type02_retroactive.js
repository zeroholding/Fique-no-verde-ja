const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';
const client = new Client({ connectionString: coolifyConn, ssl: false });

const normalize = (str) => str ? str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

async function insertRetroactiveCredits() {
    await client.connect();
    console.log("=== EXECUTING RETROACTIVE PACKAGE CREDITS (TYPE 02) ===");
    
    try {
        await client.query('BEGIN');

        // 1. Definição Exata dos Totais a Serem Injetados (Data Base: Dez/2025)
        const injections = [
            { clientName: 'J3', qty: 9026 },
            { clientName: 'TM', qty: 1569 },
            { clientName: 'SOS', qty: 393 },
            { clientName: 'FLASH', qty: 283 },
            { clientName: 'PEX', qty: 71 },
            { clientName: 'LVM', qty: 49 },
            { clientName: 'MECONECT', qty: 15 }, // Correctly spelled in DB
            { clientName: 'FASTFLEX', qty: 10 },
            { clientName: 'M3', qty: 3 }
        ];

        // 2. Localizar Vendedor Gianlucca
        const usersRes = await client.query(`SELECT id, first_name, last_name FROM users WHERE first_name ILIKE '%gianlucca%'`);
        if (usersRes.rows.length === 0) throw new Error("Attendant Gianlucca not found!");
        const gianluccaId = usersRes.rows[0].id;
        console.log(`Found Attendant: Gianlucca (${gianluccaId})`);

        // 3. Localizar Clientes e Serviços
        const clientsRes = await client.query('SELECT id, name FROM clients');
        const clientMap = new Map();
        clientsRes.rows.forEach(c => clientMap.set(normalize(c.name), c.id));

        const servicesRes = await client.query('SELECT id, name FROM services');
        const serviceMap = new Map();
        servicesRes.rows.forEach(s => serviceMap.set(normalize(s.name), s.id));
        
        // Find default package service (Assume 'Pacotes' or something similar, or fallback to first)
        let packageServiceId = serviceMap.get(normalize('Pacotes')) || serviceMap.get(normalize('Pacote')) || servicesRes.rows[0].id;

        // 4. Pegar Preços Unitários Atuais para cada um
        const pricesRes = await client.query(`
            SELECT c.name, cp.unit_price
            FROM client_packages cp
            JOIN clients c ON cp.client_id = c.id
            ORDER BY cp.created_at DESC
        `);
        const priceMap = new Map();
        // Sets latest price first
        pricesRes.rows.forEach(r => {
            const key = normalize(r.name);
            if (!priceMap.has(key)) priceMap.set(key, Number(r.unit_price));
        });

        const saleDate = new Date(2025, 11, 1, 12, 0, 0); // Dec 1st, 2025 (Month is 0-indexed)
        console.log(`Using Retroactive Sale Date: ${saleDate.toISOString()}`);

        let totalFinanceiro = 0;

        // 5. Build and Execute the Injection
        for (const inj of injections) {
            const clientKey = normalize(inj.clientName);
            const clientId = clientMap.get(clientKey);
            
            if (!clientId) {
                console.error(`❌ Client NOT FOUND in DB: ${inj.clientName}`);
                continue;
            }

            const unitPrice = priceMap.get(clientKey) || 0; // Se não achar (ex: Fastflex que era brinde), usa 0
            const totalSale = Number(unitPrice) * inj.qty;
            totalFinanceiro += totalSale;

            const saleId = uuidv4();

            console.log(`Inserting: ${inj.clientName} | Qty: ${inj.qty} | Unit: R$ ${unitPrice} | Total: R$ ${totalSale}`);

            // A. Inserir a Venda (sales)
            await client.query(`
                INSERT INTO sales 
                (id, client_id, attendant_id, total, total_discount, subtotal, general_discount_value, general_discount_type, payment_method, sale_date, status, observations, created_at)
                VALUES ($1, $2, $3, $4, 0, $5, 0, 'fixed', 'outros', $6, 'confirmada', 'Carga Inicial Retroativa Dez/2025 para cobrir consumos de planilha', NOW())
            `, [saleId, clientId, gianluccaId, totalSale, totalSale, saleDate.toISOString()]);

            // B. Inserir o Item da Venda (sale_items)
            await client.query(`
                INSERT INTO sale_items 
                (sale_id, product_id, product_name, quantity, unit_price, subtotal, total, sale_type)
                VALUES ($1, $2, $3, $4, $5, $6, $7, '02')
            `, [saleId, null, 'Pacote de Créditos (Retroativo)', inj.qty, unitPrice, totalSale, totalSale]);

            // C. Atualizar/Inserir na Carteira de Pacotes (client_packages)
            // Lógica similar à trigger de inserção TIPO 02
            const pkgExistRes = await client.query(`SELECT id, available_quantity, initial_quantity FROM client_packages WHERE client_id = $1 AND is_active = true LIMIT 1`, [clientId]);
            
            if (pkgExistRes.rows.length > 0) {
                 const pkgId = pkgExistRes.rows[0].id;
                 await client.query(`
                     UPDATE client_packages 
                     SET 
                        initial_quantity = initial_quantity + $1,
                        available_quantity = available_quantity + $1,
                        total_paid = total_paid + $2,
                        updated_at = NOW()
                     WHERE id = $3
                 `, [inj.qty, totalSale, pkgId]);
            } else {
                 await client.query(`
                     INSERT INTO client_packages 
                     (id, client_id, unit_price, initial_quantity, available_quantity, consumed_quantity, total_paid, is_active, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $4, 0, $5, true, NOW(), NOW())
                 `, [uuidv4(), clientId, unitPrice, inj.qty, totalSale]);
            }
        }

        console.log(`\n================================`);
        console.log(`✅ SUCCESS! All retroactive packages applied.`);
        console.log(`💰 Total Invoice Value Generated: R$ ${totalFinanceiro.toFixed(2)}`);
        
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ FAILED. Transaction Rolled Back.", e);
    } finally {
        await client.end();
    }
}

insertRetroactiveCredits();
