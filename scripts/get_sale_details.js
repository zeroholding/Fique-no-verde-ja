const { Client } = require('pg');

const connectionString = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';

async function getSaleDetails(saleId) {
    const client = new Client({ connectionString });
    await client.connect();

    try {
        console.log(`=== FETCHING DETAILS FOR SALE: ${saleId} ===\n`);

        // 1. Get Sale Header (Client & Attendant)
        const saleQuery = `
            SELECT 
                s.id, s.sale_date, s.status, s.total, s.total_discount, s.created_at,
                c.name as client_name, c.email as client_email, c.phone as client_phone,
                u.first_name as attendant_first, u.last_name as attendant_last, u.email as attendant_email
            FROM sales s
            LEFT JOIN clients c ON s.client_id = c.id
            LEFT JOIN users u ON s.attendant_id = u.id
            WHERE s.id = $1
        `;
        const saleRes = await client.query(saleQuery, [saleId]);

        if (saleRes.rows.length === 0) {
            console.log("Sale not found.");
            return;
        }

        const sale = saleRes.rows[0];
        console.log(`DATA: ${new Date(sale.sale_date).toLocaleDateString()}`);
        console.log(`STATUS: ${sale.status}`);
        console.log(`CLIENTE: ${sale.client_name || 'N/A'} (${sale.client_email || 'No Email'})`);
        console.log(`ATENDENTE: ${sale.attendant_first} ${sale.attendant_last} (${sale.attendant_email})`);
        console.log(`TOTAL: R$ ${sale.total}`);
        console.log(`OBS: ${sale.notes || 'Nenhuma'}`);
        console.log(`CRIADO EM: ${new Date(sale.created_at).toLocaleString()}`);
        console.log("-".repeat(50));

        // 2. Get Items
        const itemsQuery = `
            SELECT 
                si.product_name, si.quantity, si.unit_price, si.subtotal, si.total, si.sale_type
            FROM sale_items si
            WHERE si.sale_id = $1
        `;
        const itemsRes = await client.query(itemsQuery, [saleId]);

        if (itemsRes.rows.length > 0) {
            console.log("\nITENS DA VENDA:");
            itemsRes.rows.forEach((item, idx) => {
                console.log(`${idx + 1}. ${item.product_name}`);
                console.log(`   Qtd: ${item.quantity} x R$ ${item.unit_price} = R$ ${item.subtotal}`);
                console.log(`   Tipo: ${item.sale_type === '01' ? 'Venda' : item.sale_type === '02' ? 'Pacote' : 'Consumo'}`);
            });
        } else {
            console.log("\nNenhum item encontrado nesta venda.");
        }
        
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await client.end();
    }
}

const saleId = process.argv[2] || '178bd07d-4d8d-49fc-a1bb-5145b8eb9923';
getSaleDetails(saleId);
