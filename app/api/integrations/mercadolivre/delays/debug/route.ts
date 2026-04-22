import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

// TEMPORARY DEBUG ENDPOINT - Remove after investigation
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("order_id");
    const mlUserId = searchParams.get("ml_user_id");

    if (!orderId || !mlUserId) {
      return NextResponse.json({ error: "order_id and ml_user_id required" }, { status: 400 });
    }

    // Get credentials
    const authRes = await query(
      "SELECT access_token, refresh_token, expires_at FROM mercado_livre_credentials WHERE user_id = $1 AND ml_user_id = $2 LIMIT 1",
      [decoded.userId, mlUserId]
    );
    if (authRes.rows.length === 0) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    let accessToken = authRes.rows[0].access_token;
    const refreshToken = authRes.rows[0].refresh_token;
    const expiresAt = authRes.rows[0].expires_at;

    // Refresh if expired — mesma lógica do módulo Reputação
    const expirationDate = new Date(expiresAt);
    const now = new Date();
    if (now.getTime() + 5 * 60 * 1000 > expirationDate.getTime()) {
      const resp = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: process.env.MERCADO_LIVRE_APP_ID!,
          client_secret: process.env.MERCADO_LIVRE_SECRET_KEY!,
          refresh_token: refreshToken,
        }),
      });
      if (!resp.ok) {
        return NextResponse.json({ error: "Token refresh failed: " + (await resp.text()) }, { status: 401 });
      }
      const newTokenData = await resp.json();
      accessToken = newTokenData.access_token;
      const newExpiresAt = new Date();
      newExpiresAt.setSeconds(newExpiresAt.getSeconds() + newTokenData.expires_in);
      await query(
        `UPDATE mercado_livre_credentials SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW() WHERE user_id = $4 AND ml_user_id = $5`,
        [accessToken, newTokenData.refresh_token, newExpiresAt.toISOString(), decoded.userId, mlUserId]
      );
    }

    // Fetch Order
    const orderRes = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const orderData = await orderRes.json();

    // Fetch Shipment
    let shipmentData = null;
    const shippingId = orderData?.shipping?.id;
    if (shippingId) {
      const shipRes = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      shipmentData = await shipRes.json();
    }

    return NextResponse.json({
      order: orderData,
      shipment: shipmentData,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
