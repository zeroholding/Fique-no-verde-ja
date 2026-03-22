import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

// GET /api/cupons/validate?code=XYZ
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    
    // Qualquer usuário autenticado pode validar um cupom (precisa do token para fazer vendas)
    jwt.verify(token, JWT_SECRET);

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code")?.toUpperCase().trim();
    const clientId = searchParams.get("clientId")?.trim();

    if (!code) {
      return NextResponse.json({ error: "Código do cupom é obrigatório" }, { status: 400 });
    }

    // Buscar o cupom pelo código
    const result = await query(`SELECT * FROM cupons WHERE code = $1 LIMIT 1`, [code]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Cupom inválido ou não encontrado." }, { status: 404 });
    }

    const cupom = result.rows[0];

    // Verificar se está ativo
    if (!cupom.is_active) {
      return NextResponse.json({ error: "Este cupom está inativo." }, { status: 400 });
    }

    // Verificar data de expiração (ignorando horas para evitar fuso horário de UTC na véspera)
    if (cupom.expires_at) {
      const expDate = new Date(cupom.expires_at);
      const today = new Date();
      // Zerar a hora para comparar apenas os dias
      expDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);

      if (expDate < today) {
        return NextResponse.json({ error: "Este cupom já expirou." }, { status: 400 });
      }
    }

    // Verificar limite de usos (ignorando vendas canceladas)
    if (cupom.max_uses !== null) {
      const usesResult = await query(
        `SELECT COUNT(id) as total_uses FROM sales WHERE cupom_id = $1 AND status != 'cancelada'`, 
        [cupom.id]
      );
      const currentUses = parseInt(usesResult.rows[0].total_uses, 10);
      
      if (currentUses >= cupom.max_uses) {
        return NextResponse.json({ error: "O limite máximo de uso deste cupom foi atingido." }, { status: 400 });
      }
    }

    // Verificar se este cliente já utilizou este cupom anteriormente
    let warning: string | null = null;

    if (clientId) {
      const pastUsageResult = await query(`
        SELECT created_at 
        FROM sales 
        WHERE cupom_id = $1 AND client_id = $2 AND status != 'cancelada'
        ORDER BY created_at DESC
        LIMIT 1
      `, [cupom.id, clientId]);

      if (pastUsageResult.rows.length > 0) {
        const warningDate = new Date(pastUsageResult.rows[0].created_at).toLocaleDateString("pt-BR");
        warning = `Este cliente já utilizou o cupom ${cupom.code} no dia ${warningDate}.`;
      }
    }

    // Cupom válido! Retornar dados
    return NextResponse.json({
      success: true,
      warning,
      data: {
        id: cupom.id,
        code: cupom.code,
        type: cupom.discount_type,
        value: Number(cupom.discount_value)
      }
    });

  } catch (error) {
    console.error("Erro validando cupom:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
