const { Client } = require('pg');

const connectionString = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';

async function testLogic() {
    const client = new Client({ connectionString });
    await client.connect();

    try {
        console.log("TESTING SQL LOGIC ON TIMESTAMPS");

        // timestamps from previous script output
        // Visible: 2026-02-02T20:53:37.015Z (17:53 BRT)
        // Hidden:  2026-02-02T22:13:13.057Z (19:13 BRT)

        const timestamps = [
            '2026-02-02 20:53:37.015+00',
            '2026-02-02 22:13:13.057+00'
        ];

        for (const ts of timestamps) {
            const query = `
                SELECT 
                    $1::timestamptz as original,
                    ($1::timestamptz AT TIME ZONE 'UTC') as at_utc,
                    ($1::timestamptz AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') as double_convert,
                    TO_CHAR($1::timestamptz AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') as result_char,
                    ($1::timestamptz AT TIME ZONE 'America/Sao_Paulo') as single_convert,
                    TO_CHAR($1::timestamptz AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') as single_result_char
            `;
            
            const res = await client.query(query, [ts]);
            console.log("---------------------------------------------------");
            console.log("Input:", ts);
            console.log("Double Convert Result:", res.rows[0].result_char);
            console.log("Single Convert Result:", res.rows[0].single_result_char);
            console.log("Full Row:", res.rows[0]);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

testLogic();
