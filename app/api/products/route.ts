import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type DecodedToken = {
  userId: string;
};

const getTokenFromRequest = (request: NextRequest) => {
  const cookieToken = request.cookies.get("token")?.value;
  if (cookieToken) {
    return cookieToken;
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  return null;
};

const authenticateUser = async (request: NextRequest) => {
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Error("Token de autenticacao nao informado");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;

    const result = await query(
      `SELECT id FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (result.rowCount === 0) {
      throw new Error("Usuario nao encontrado");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Falha na autenticacao:", error);
    throw new Error("Falha na autenticacao");
  }
};

// GET - Listar produtos com faixas de preço
export async function GET(request: NextRequest) {
  try {
    await authenticateUser(request);

    // Buscar produtos ativos
    const productsResult = await query(
      `SELECT
        id,
        name,
        description,
        sku,
        is_active,
        created_at,
        updated_at
       FROM products
       WHERE is_active = true
       ORDER BY name ASC`
    );

    const products = [];

    // Para cada produto, buscar suas faixas de preço vigentes
    for (const product of productsResult.rows) {
      const priceRangesResult = await query(
        `SELECT
          id,
          min_quantity,
          max_quantity,
          unit_price,
          valid_from,
          valid_until,
          is_active
         FROM price_ranges
         WHERE product_id = $1
           AND is_active = true
           AND valid_from <= CURRENT_DATE
           AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
         ORDER BY min_quantity ASC`,
        [product.id]
      );

      products.push({
        id: product.id,
        name: product.name,
        description: product.description,
        sku: product.sku,
        isActive: product.is_active,
        createdAt: product.created_at,
        updatedAt: product.updated_at,
        priceRanges: priceRangesResult.rows.map((range: any) => ({
          id: range.id,
          minQuantity: range.min_quantity,
          maxQuantity: range.max_quantity,
          unitPrice: parseFloat(range.unit_price),
          validFrom: range.valid_from,
          validUntil: range.valid_until,
          isActive: range.is_active,
        })),
      });
    }

    return NextResponse.json({ products }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel carregar os produtos";
    const status = message.includes("autenticacao") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// GET - Buscar preço unitário para um produto baseado na quantidade
export async function POST(request: NextRequest) {
  try {
    await authenticateUser(request);
    const { productId, quantity } = await request.json();

    if (!productId || !quantity) {
      return NextResponse.json(
        { error: "ID do produto e quantidade sao obrigatorios" },
        { status: 400 }
      );
    }

    // Buscar o preço adequado para a quantidade especificada
    const priceResult = await query(
      `SELECT
        unit_price,
        min_quantity,
        max_quantity
       FROM price_ranges
       WHERE product_id = $1
         AND is_active = true
         AND valid_from <= CURRENT_DATE
         AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
         AND min_quantity <= $2
         AND (max_quantity IS NULL OR max_quantity >= $2)
       ORDER BY min_quantity DESC
       LIMIT 1`,
      [productId, quantity]
    );

    if (priceResult.rowCount === 0) {
      return NextResponse.json(
        { error: "Faixa de preco nao encontrada para esta quantidade" },
        { status: 404 }
      );
    }

    const priceRange = priceResult.rows[0];

    return NextResponse.json(
      {
        unitPrice: parseFloat(priceRange.unit_price),
        minQuantity: priceRange.min_quantity,
        maxQuantity: priceRange.max_quantity,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao buscar preco";
    const status = message.includes("autenticacao") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
