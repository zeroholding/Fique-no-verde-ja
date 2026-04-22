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

    // Get access token
    const authRes = await query(
      "SELECT access_token FROM mercado_livre_credentials WHERE user_id = $1 AND ml_user_id = $2 LIMIT 1",
      [decoded.userId, mlUserId]
    );
    if (authRes.rows.length === 0) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    const accessToken = authRes.rows[0].access_token;

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
