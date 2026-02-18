import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type DecodedToken = { userId: string };

const authenticateAdmin = async (request: NextRequest) => {
  const token = request.headers.get("authorization")?.split(" ")[1];
  if (!token) throw new Error("Token não fornecido");

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    const result = await query(
      `SELECT id, is_admin FROM users WHERE id = $1`,
      [decoded.userId]
    );
    const user = result.rows[0];
    if (!user || !user.is_admin) {
      throw new Error("Acesso negado. Apenas administradores.");
    }
    return user;
  } catch (error) {
    throw new Error("Falha na autenticação");
  }
};

export async function POST(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    
    const body = await request.json();
    const { clientId, newBalance, newUnitPrice } = body;

    if (!clientId) {
        return NextResponse.json({ error: "Client ID obrigatório" }, { status: 400 });
    }

    // 1. Get current package
    const pkgRes = await query(`SELECT * FROM client_packages WHERE client_id = $1`, [clientId]);
    
    if (pkgRes.rows.length === 0) {
        return NextResponse.json({ error: "Pacote não encontrado para este cliente" }, { status: 404 });
    }

    const pkg = pkgRes.rows[0];
    
    // Prepare update values
    let targetBalance = Number(pkg.available_quantity);
    let targetPrice = Number(pkg.unit_price);
    let targetInitial = Number(pkg.initial_quantity);
    const consumed = Number(pkg.consumed_quantity);

    if (newBalance !== undefined && newBalance !== null) {
        targetBalance = Number(newBalance);
        // Adjust initial to match the math: Available = Initial - Consumed
        // Therefore: Initial = Available + Consumed
        targetInitial = targetBalance + consumed;
    }

    if (newUnitPrice !== undefined && newUnitPrice !== null) {
        targetPrice = Number(newUnitPrice);
    }

    // Update DB
    await query(
        `UPDATE client_packages 
         SET available_quantity = $1, 
             initial_quantity = $2, 
             unit_price = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [targetBalance, targetInitial, targetPrice, pkg.id]
    );

    console.log(`[MANUAL UPDATE] Package ${pkg.id} (Client ${clientId}) updated. Balance: ${targetBalance}, Price: ${targetPrice}`);

    return NextResponse.json({ 
        message: "Pacote atualizado com sucesso",
        package: {
            available_quantity: targetBalance,
            unit_price: targetPrice
        }
    });

  } catch (error: any) {
    console.error("Erro ao atualizar pacote:", error);
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 400 });
  }
}
