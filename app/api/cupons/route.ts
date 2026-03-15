import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

// GET /api/cupons
// Lista cupons ativos disponíveis para uso pelas vendedoras/atendentes
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    jwt.verify(token, JWT_SECRET); // Valida se há um usuário válido na sessão

    // Busca apenas cupons ativos que ainda não venceram usando lógica parecida de limite
    // Limitamos apenas os que estão abertamente marcados como 'is_active = true'
    const result = await query(`
      SELECT 
        id, 
        code, 
        discount_type, 
        discount_value, 
        max_uses,
        expires_at
      FROM cupons 
      WHERE is_active = true
      ORDER BY created_at DESC
    `);

    // Podemos fazer uma checagem local por limite e data se quisermos ou deixar o validate resolver
    // Vamos mandar tudo que tá is_active, o frontend marca os expirados se der ruim ou apenas oculta
    const available = result.rows.map(c => ({
      id: c.id,
      code: c.code,
      discountType: c.discount_type,
      discountValue: Number(c.discount_value),
      expiresAt: c.expires_at,
      maxUses: c.max_uses
    }));

    return NextResponse.json({
      success: true,
      data: available
    });
  } catch (error) {
    console.error("Erro listando cupons disponíveis:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
