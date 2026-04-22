require('dotenv').config({ path: '.env' });
const { Client } = require('pg');

const TOKYO_ML_ID = '242678667';
const ORDER_ID = '2000012593433745';

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/fique_no_verde_ja'
  });

  try {
    await client.connect();

    // 1. Pegar token do TOKYO
    const res = await client.query("SELECT access_token FROM mercado_livre_credentials WHERE ml_user_id = $1 LIMIT 1", [TOKYO_ML_ID]);
    if (res.rows.length === 0) {
      console.log("Conta TOKYO não encontrada no banco local.");
      return;
    }
    const token = res.rows[0].access_token;
    
    console.log("Token obtido. Buscando Order...");

    // 2. Fetch Order
    const orderRes = await fetch(`https://api.mercadolibre.com/orders/${ORDER_ID}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const orderData = await orderRes.json();
    
    console.log("=== ORDER DATA ===");
    console.dir(orderData, { depth: null, colors: true });

    // 3. Fetch Shipment se existir
    const shippingId = orderData.shipping?.id;
    if (shippingId) {
      console.log("\nBuscando Shipment ID:", shippingId);
      const shipRes = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}`, {
         headers: { Authorization: `Bearer ${token}` }
      });
      const shipData = await shipRes.json();
      
      console.log("=== SHIPMENT DATA ===");
      console.dir(shipData, { depth: null, colors: true });
    } else {
      console.log("Nenhum shipping ID encontrado na order.");
    }

  } catch (error) {
    console.error("Erro:", error);
  } finally {
    await client.end();
  }
}

run();
