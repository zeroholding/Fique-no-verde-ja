import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { query } from "../lib/db";

async function simulateRealFlow() {
  const finalSaleDate = new Date();
  console.log('--- START SIMULATION ---');
  console.log('1. JS Date object:', finalSaleDate.toISOString());

  try {
    // A. Insert Sale
    const saleResult = await query(
      `INSERT INTO sales (
          client_id,
          attendant_id,
          sale_date,
          status,
          confirmed_at
        ) VALUES ($1, $2, $3, 'confirmada', CURRENT_TIMESTAMP)
        RETURNING id, sale_date`,
      [
        '0b788c39-c305-4bd9-a823-951032d2733c', // Cliente Morais Teste
        '51cbe1f7-0c68-47e0-a565-1ad4aa09f680', // Admin
        finalSaleDate
      ]
    );

    const saleId = saleResult.rows[0].id;
    const saleDate = saleResult.rows[0].sale_date;
    console.log('2. Returned from DB (saleId):', saleId);
    console.log('3. Returned from DB (saleDate):', saleDate, 'Type:', typeof saleDate);

    // B. Insert Commission
    const commResult = await query(
      `INSERT INTO commissions (
        sale_id,
        sale_item_id,
        user_id,
        base_amount,
        commission_type,
        commission_rate,
        commission_amount,
        reference_date,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'a_pagar') RETURNING reference_date`,
      [
        saleId,
        '661e65ba-c952-4c76-90ad-b074a5451aab',
        '51cbe1f7-0c68-47e0-a565-1ad4aa09f680',
        1000,
        'percentage',
        3.5,
        35,
        saleDate
      ]
    );

    console.log('4. Stored in Commission:', commResult.rows[0].reference_date);
    console.log('--- END SIMULATION ---');
  } catch (err) {
    console.error('Simulation Failed:', err);
  }
}

simulateRealFlow();
