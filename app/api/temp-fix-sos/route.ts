
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    // 1. Get Client ID for SOS
    const clientRes = await query("SELECT id FROM clients WHERE name = 'SOS'");
    if (clientRes.rows.length === 0) {
      return NextResponse.json({ error: "Client SOS not found" }, { status: 404 });
    }
    const clientId = clientRes.rows[0].id;

    // 2. Calculate current effective balance (Legacy + Reloads - Consumed)
    
    // Legacy
    const legacyRes = await query("SELECT SUM(initial_quantity) as val FROM client_packages WHERE client_id = $1", [clientId]);
    const legacy = Number(legacyRes.rows[0].val || 0);

    // Reloads (Invisible Type 02)
    const reloadsRes = await query(`
      SELECT SUM(si.quantity) as val
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id
      WHERE s.client_id = $1
      AND si.sale_type = '02'
      AND s.status != 'cancelada'
      AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE client_id = $1 AND sale_id IS NOT NULL)
    `, [clientId]);
    const reloads = Number(reloadsRes.rows[0].val || 0);

    // Consumed
    const consumedRes = await query(`
      SELECT SUM(quantity) as val
      FROM package_consumptions pc
      JOIN client_packages cp ON pc.package_id = cp.id
      WHERE cp.client_id = $1
    `, [clientId]);
    const consumed = Number(consumedRes.rows[0].val || 0);

    const currentBalance = legacy + reloads - consumed;

    if (currentBalance <= 0) {
      return NextResponse.json({ message: "Balance is already 0 or negative", currentBalance });
    }

    // 3. Create Correction Consumption
    // We need a package to attach the consumption to. We'll pick the most recent one.
    const packageRes = await query(`
        SELECT id FROM client_packages WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1
    `, [clientId]);
    
    let packageId = null;
    if (packageRes.rows.length > 0) {
        packageId = packageRes.rows[0].id;
    } else {
        // If no package exists, we can't create a consumption legitimately linked to one.
        // But SOS has legacy packages, so this should pass.
        return NextResponse.json({ error: "No package found for SOS to attach consumption" }, { status: 500 });
    }

    // Create a "Adjustment" Sale to justify the consumption (Optional, but good for trace)
    // Actually, zero_sos.js created a sale. Let's do that for consistency.
    
    // Insert Sale
    const saleRes = await query(`
        INSERT INTO sales (client_id, total, status, sale_date, sale_type)
        VALUES ($1, 0, 'concluida', NOW(), '03')
        RETURNING id
    `, [clientId]);
    const saleId = saleRes.rows[0].id;

    // Insert Sale Item
    await query(`
        INSERT INTO sale_items (sale_id, product_name, quantity, unit_price, subtotal, total, sale_type)
        VALUES ($1, 'Ajuste de Saldo (Zerar)', $2, 0, 0, 0, '03')
    `, [saleId, currentBalance]);

    // Insert Consumption
    await query(`
        INSERT INTO package_consumptions (client_package_id, quantity, consumed_at, description, sale_id, total_value, unit_price)
        VALUES ($1, $2, NOW(), 'Ajuste Automático para Zerar Saldo', $3, 0, 0)
    `, [packageId, currentBalance, saleId]);

    // Update Client Package (Reflect consumption in the package itself)
    // We update the package we attached to.
    await query(`
        UPDATE client_packages
        SET consumed_quantity = consumed_quantity + $1,
            available_quantity = available_quantity - $1
        WHERE id = $2
    `, [currentBalance, packageId]);

    return NextResponse.json({ 
        success: true, 
        previousBalance: currentBalance,
        newBalance: 0,
        action: "Created adjustment consumption",
        details: { legacy, reloads, consumed }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}
