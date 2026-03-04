require("dotenv").config({ path: ".env.local" });
const { Client } = require('pg');

const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: false
});

async function run() {
    await c.connect();
    try {
        const res = await c.query('SELECT ml_user_id, access_token, refresh_token FROM mercado_livre_credentials ORDER BY updated_at DESC LIMIT 1');
        if (res.rows.length === 0) { return; }
        let { ml_user_id, access_token, refresh_token } = res.rows[0];

        // refresh token
        const refreshRes = await fetch("https://api.mercadolibre.com/oauth/token", {
            method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
            body: new URLSearchParams({
                grant_type: "refresh_token", client_id: process.env.MERCADO_LIVRE_APP_ID,
                client_secret: process.env.MERCADO_LIVRE_SECRET_KEY, refresh_token: refresh_token,
            }),
        });
        if (refreshRes.ok) { access_token = (await refreshRes.json()).access_token; }

        const claimIds = [5479722513, 5477917030, 5479687760];

        for (const claimId of claimIds) {
            console.log(`\n=== Claim ${claimId} ===`);

            // 1. Tenta o endpoint de mensagens da claim
            console.log(`\n1) GET /post-purchase/v1/claims/${claimId}/messages`);
            const r1 = await fetch(`https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}/messages?limit=50&offset=0`, {
                headers: { Authorization: `Bearer ${access_token}` }
            });
            console.log(`   Status: ${r1.status}`);
            const d1 = await r1.json();
            console.log(`   Response keys: ${Object.keys(d1)}`);
            if (d1.data) {
                console.log(`   Messages count: ${Array.isArray(d1.data) ? d1.data.length : 'not array'}`);
                if (Array.isArray(d1.data) && d1.data.length > 0) {
                    console.log(`   First message:`, JSON.stringify(d1.data[0], null, 2));
                }
            }
            if (d1.paging) {
                console.log(`   Paging:`, JSON.stringify(d1.paging));
            }
            if (d1.error || d1.message) {
                console.log(`   Error/Message:`, d1.error || d1.message);
            }

            // 2. Busca detalhes da claim para pegar resource_id (shipment/order)
            console.log(`\n2) GET /post-purchase/v1/claims/${claimId} (detalhes)`);
            const r2 = await fetch(`https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}`, {
                headers: { Authorization: `Bearer ${access_token}` }
            });
            const d2 = await r2.json();
            console.log(`   resource: ${d2.resource}, resource_id: ${d2.resource_id}`);

            // 3. Se for shipment, tenta pegar o pack/order_id associado
            if (d2.resource === 'shipment' && d2.resource_id) {
                console.log(`\n3) GET /shipments/${d2.resource_id} (buscar order_id/pack_id)`);
                const r3 = await fetch(`https://api.mercadolibre.com/shipments/${d2.resource_id}`, {
                    headers: { Authorization: `Bearer ${access_token}` }
                });
                const d3 = await r3.json();
                console.log(`   order_id: ${d3.order_id}, pack_id: ${d3.pack_id || 'N/A'}`);
                
                // 4. Tenta buscar mensagens pelo pack
                const packId = d3.pack_id || d3.order_id;
                if (packId) {
                    console.log(`\n4) GET /messages/packs/${packId}/sellers/${ml_user_id} (mensagens pelo pack)`);
                    const r4 = await fetch(`https://api.mercadolibre.com/messages/packs/${packId}/sellers/${ml_user_id}?tag=post_sale&limit=20&offset=0`, {
                        headers: { Authorization: `Bearer ${access_token}` }
                    });
                    const d4 = await r4.json();
                    const msgs = Array.isArray(d4.messages) ? d4.messages : [];
                    console.log(`   Pack messages count: ${msgs.length}`);
                    if (msgs.length > 0) {
                        console.log(`   Last message text: "${msgs[0]?.text?.slice(0,100) || '(sem texto)'}"`);
                    }
                }
            }

            // Se for order/purchase
            if (d2.resource === 'order' && d2.resource_id) {
                console.log(`\n3) Tratando como order, order_id: ${d2.resource_id}`);
                const r3 = await fetch(`https://api.mercadolibre.com/orders/${d2.resource_id}`, {
                    headers: { Authorization: `Bearer ${access_token}` }
                });
                const d3 = await r3.json();
                const packId = d3.pack_id || d2.resource_id;
                console.log(`   pack_id: ${packId}`);
                
                if (packId) {
                    console.log(`\n4) GET /messages/packs/${packId}/sellers/${ml_user_id}`);
                    const r4 = await fetch(`https://api.mercadolibre.com/messages/packs/${packId}/sellers/${ml_user_id}?tag=post_sale&limit=20&offset=0`, {
                        headers: { Authorization: `Bearer ${access_token}` }
                    });
                    const d4 = await r4.json();
                    const msgs = Array.isArray(d4.messages) ? d4.messages : [];
                    console.log(`   Pack messages count: ${msgs.length}`);
                    if (msgs.length > 0) {
                        console.log(`   Last message text: "${msgs[0]?.text?.slice(0,100) || '(sem texto)'}"`);
                    }
                }
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await c.end();
    }
}
run();
