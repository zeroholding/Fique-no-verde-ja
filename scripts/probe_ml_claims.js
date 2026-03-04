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
        if (res.rows.length === 0) {
            console.log("No credentials found");
            return;
        }
        let { ml_user_id, access_token, refresh_token } = res.rows[0];

        // refresh token
        const refreshRes = await fetch("https://api.mercadolibre.com/oauth/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                client_id: process.env.MERCADO_LIVRE_APP_ID,
                client_secret: process.env.MERCADO_LIVRE_SECRET_KEY,
                refresh_token: refresh_token,
            }),
        });

        if (refreshRes.ok) {
            const data = await refreshRes.json();
            access_token = data.access_token;
        } else {
             console.log("Failed to refresh", await refreshRes.text());
        }

        console.log(`Fetching claims for seller ${ml_user_id}...`);
        
        // Fetch last 10 claims
        const response = await fetch(`https://api.mercadolibre.com/post-purchase/v1/claims/search?player_role=respondent&player_user_id=${ml_user_id}&sort=last_updated:desc&limit=20`, {
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        });
        
        const data = await response.json();
        if (data && data.data) {
            console.log(JSON.stringify(data.data.slice(0, 2), null, 2));

            // See if any has affected reputation flag
            let found = 0;
            for (const claim of data.data) {
                 if (JSON.stringify(claim).toLowerCase().includes('reputation')) {
                     console.log("Found reputation substring in claim:", claim.id);
                     found++;
                 }
            }
            if (!found) console.log("No reputation flag found inside the 20 claims.");
        } else {
            console.log("No data returned:", data);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await c.end();
    }
}
run();
