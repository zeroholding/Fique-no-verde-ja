const { Client } = require('pg');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';
const TOKYO_ML_ID = '242678667';
const ORDER_ID = '2000012593433745';

async function run() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  try {
    await client.connect();
    console.log("Conectado. Buscando token...");

    const res = await client.query("SELECT access_token FROM mercado_livre_credentials WHERE ml_user_id = $1 LIMIT 1", [TOKYO_ML_ID]);
    if (res.rows.length === 0) {
      console.log("Conta TOKYO não encontrada."); return;
    }
    const token = res.rows[0].access_token;

    console.log("Token obtido. Buscando Order...");
    const orderRes = await fetch(`https://api.mercadolibre.com/orders/${ORDER_ID}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const orderData = await orderRes.json();
    console.log("=== ORDER TAGS & STATUS ===");
    console.log("Tags da Order:", orderData.tags);
    console.log("Status:", orderData.status);
    console.log("Feedback:", orderData.feedback);
    console.log("Data do pedido:", orderData.date_created);

    const shippingId = orderData.shipping?.id;
    if (shippingId) {
      console.log("\nBuscando Shipment ID:", shippingId);
      const shipRes = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}`, {
         headers: { Authorization: `Bearer ${token}` }
      });
      const shipData = await shipRes.json();
      console.log("=== SHIPMENT DATA ===");
      console.log("Mode:", shipData.mode);
      console.log("Logistic Type:", shipData.logistic_type);
      console.log("Status:", shipData.status);
      console.log("Substatus:", shipData.substatus);
      console.log("Date Handling limit:", shipData.shipping_option?.handling_time?.limit);
      console.log("Date Shipped:", shipData.date_shipped || ((shipData.status_history || {}).date_shipped));
      console.log("Tags do envio:", shipData.tags);
      console.log("Lead Time / SLA:", shipData.lead_time);
    }

  } catch (error) {
    console.error("Erro:", error);
  } finally {
    await client.end();
  }
}

run();
