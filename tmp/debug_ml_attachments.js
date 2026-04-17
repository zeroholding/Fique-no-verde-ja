const { Pool } = require("pg");

const pool = new Pool({
  connectionString: "postgresql://postgres:supertokio2024@72.61.62.227:5434/postgres",
});

async function run() {
  const accountId = "550734005"; // Example seller ID, we will fetch the real one if needed, or query all credentials
  const claimId = "5481028172";

  // Get any valid token
  const res = await pool.query("SELECT access_token, ml_user_id FROM mercado_livre_credentials LIMIT 1");
  if (res.rows.length === 0) {
    console.log("No credentials found");
    return;
  }
  
  const token = res.rows[0].access_token;
  const sellerId = res.rows[0].ml_user_id;

  console.log("Fetching claims messages...");
  const claimMsgsRes = await fetch(`https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}/messages`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!claimMsgsRes.ok) {
     console.log("Failed claim msgs fetch", claimMsgsRes.status, await claimMsgsRes.text());
  } else {
     const claimMsgs = await claimMsgsRes.json();
     console.log("Claim Msgs Attachments:", JSON.stringify(
       (claimMsgs.data || claimMsgs.messages || []).map(m => ({ text: m.message, att: m.attachments })),
       null, 2
     ));
  }
  
  console.log("\nFetching claim resource to get pack_id...");
  const claimRes = await fetch(`https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const claimData = await claimRes.json();
  const resourceId = claimData.resource_id;
  const resourceType = claimData.resource;
  
  let packId = null;
  if (resourceType === 'order') packId = resourceId;
  else if (resourceType === 'shipment') {
      const shipRes = await fetch(`https://api.mercadolibre.com/shipments/${resourceId}`, {
          headers: { Authorization: `Bearer ${token}` }
      });
      const shipData = await shipRes.json();
      packId = shipData.pack_id || shipData.order_id;
  }
  
  console.log("Pack ID:", packId);
  if (packId) {
     const packRes = await fetch(`https://api.mercadolibre.com/messages/packs/${packId}/sellers/${sellerId}?tag=post_sale`, {
         headers: { Authorization: `Bearer ${token}` }
     });
     const packData = await packRes.json();
     console.log("Pack Msgs Attachments:", JSON.stringify(
       (packData.messages || []).map(m => ({ text: m.text, att: m.attachments })),
       null, 2
     ));
  }
  
  process.exit(0);
}

run();
