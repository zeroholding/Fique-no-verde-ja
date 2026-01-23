
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  connectionString: 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres',
});

async function exportActivity() {
  await client.connect();
  console.log("Connected to VPS Database...");

  try {
    const startDate = '2026-01-22 00:00:00';
    const endDate = '2026-01-23 23:59:59';
    // Use Brazil TZ adjustment if necessary, but DB is likely UTC or user compatible. 
    // We will query blindly on the string dates first.

    // 1. Export Sales (Types 1, 2, 3)
    const salesQuery = `
      SELECT 
        s.*, c.name as client_name,
        json_agg(si.*) as items
      FROM sales s
      LEFT JOIN clients c ON s.client_id = c.id
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE s.sale_date >= $1 AND s.sale_date <= $2
      GROUP BY s.id, c.name
      ORDER BY s.sale_date DESC
    `;
    const salesRes = await client.query(salesQuery, [startDate, endDate]);
    console.log(`Found ${salesRes.rows.length} sales.`);

    // 2. Export Package Consumptions
    const consumptionsQuery = `
      SELECT 
        pc.*, 
        c.name as client_name,
        serv.name as service_name
      FROM package_consumptions pc
      JOIN client_packages cp ON pc.package_id = cp.id -- using package_id corrected
      JOIN clients c ON cp.client_id = c.id
      LEFT JOIN services serv ON cp.service_id = serv.id
      WHERE pc.consumed_at >= $1 AND pc.consumed_at <= $2
      ORDER BY pc.consumed_at DESC
    `;
    
    // Note: try/catch for package_id vs client_package_id in case of schema confusion
    let consumptionsRes;
    try {
        consumptionsRes = await client.query(consumptionsQuery, [startDate, endDate]);
    } catch (e) {
        console.log("Retrying consumption query with client_package_id...");
         const consumptionsQueryAlt = `
          SELECT 
            pc.*, 
            c.name as client_name,
            serv.name as service_name
          FROM package_consumptions pc
          JOIN client_packages cp ON pc.client_package_id = cp.id
          JOIN clients c ON cp.client_id = c.id
          LEFT JOIN services serv ON cp.service_id = serv.id
          WHERE pc.consumed_at >= $1 AND pc.consumed_at <= $2
          ORDER BY pc.consumed_at DESC
        `;
        consumptionsRes = await client.query(consumptionsQueryAlt, [startDate, endDate]);
    }
    console.log(`Found ${consumptionsRes.rows.length} consumptions.`);

    // 3. Export New Client Packages (Created in this period)
    const packagesQuery = `
      SELECT cp.*, c.name as client_name
      FROM client_packages cp
      JOIN clients c ON cp.client_id = c.id
      WHERE cp.created_at >= $1 AND cp.created_at <= $2
    `;
    const packagesRes = await client.query(packagesQuery, [startDate, endDate]);
    console.log(`Found ${packagesRes.rows.length} new packages.`);

    const exportData = {
      meta: {
        exportedAt: new Date().toISOString(),
        dateRange: { start: startDate, end: endDate },
        source: 'VPS (72.61.62.227:5433)'
      },
      sales: salesRes.rows,
      consumptions: consumptionsRes.rows,
      new_packages: packagesRes.rows
    };

    const filename = path.join(__dirname, 'vps_activity_export_2026_01_22_23.json');
    fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
    console.log(`Export saved to: ${filename}`);

  } catch (err) {
    console.error('Error exporting data:', err);
  } finally {
    await client.end();
  }
}

exportActivity();
