require("dotenv").config({ path: ".env.local" });
const { Client } = require('pg');

const c = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres',
    ssl: false
});

async function run() {
    await c.connect();
    try {
        const res = await c.query('SELECT ml_user_id, access_token, refresh_token FROM mercado_livre_credentials ORDER BY updated_at DESC LIMIT 1');
        if (res.rows.length === 0) { return; }
        let { access_token, refresh_token } = res.rows[0];

        // refresh token
        const refreshRes = await fetch("https://api.mercadolibre.com/oauth/token", {
            method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
            body: new URLSearchParams({
                grant_type: "refresh_token", client_id: process.env.MERCADO_LIVRE_APP_ID,
                client_secret: process.env.MERCADO_LIVRE_SECRET_KEY, refresh_token: refresh_token,
            }),
        });
        if (refreshRes.ok) { access_token = (await refreshRes.json()).access_token; }

        console.log(`Checking affects-reputation for claim 5480165828...`);
        const response = await fetch(`https://api.mercadolibre.com/post-purchase/v1/claims/5480165828/affects-reputation`, {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await c.end();
    }
}
run();
