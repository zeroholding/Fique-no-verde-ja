import { config } from 'dotenv';
config({ path: '.env.local' });
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: "postgresql://postgres:supertokio2024@72.61.62.227:5434/postgres"
});

async function main() {
  try {
    const creds = await pool.query("SELECT ml_user_id, access_token FROM mercado_livre_credentials LIMIT 1");
    if (creds.rows.length === 0) { console.log("No credentials."); return; }
    const { ml_user_id, access_token } = creds.rows[0];
    console.log("Using ml_user_id", ml_user_id);
    
    // 1. Fetch Orders
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 60);
    const dateFromStr = dateFrom.toISOString().split(".")[0] + ".000-00:00"; 
    
    const url = `https://api.mercadolibre.com/orders/search?seller=${ml_user_id}&order.date_created.from=${dateFromStr}&sort=date_desc&limit=5`;
    console.log("Fetching orders:", url);
    
    const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
    const data = await res.json();
    console.log("Orders count:", data.results?.length);
    
    if (data.results && data.results.length > 0) {
      const order = data.results[0];
      console.log("Status:", order.status);
      console.log("Shipping:", order.shipping);
      
      const shippingId = order.shipping?.id;
      if (shippingId) {
        console.log("Fetching shipment", shippingId);
        const sRes = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}`, { headers: { Authorization: `Bearer ${access_token}` } });
        const sData = await sRes.json();
        console.log("Shipment status:", sData.status);
        console.log("Logistics:", sData.logistic_type);
        
        const limitStr = sData.shipping_option?.list_cost || sData.shipping_option?.handling_time?.limit || sData.date_first_printed;
        console.log("Extracted limit date:", limitStr);
        
        // ML's actual SLA dates are in expected_delivery or estimated_handling_limit, or similar.
        console.log("All handling time data:", JSON.stringify(sData.shipping_option, null, 2));
      }
    }
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

main();
