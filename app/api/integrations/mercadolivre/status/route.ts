import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const userId = decoded.userId;

    const result = await query(
      "SELECT ml_user_id, nickname, access_token, created_at, updated_at FROM mercado_livre_credentials WHERE user_id = $1 ORDER BY updated_at DESC",
      [userId]
    );

    const accounts = await Promise.all(result.rows.map(async (account: any) => {
      // Se não tiver nickname, tenta buscar
      if (!account.nickname && account.access_token) {
        try {
          const userResponse = await fetch("https://api.mercadolibre.com/users/me", {
            headers: {
              "Authorization": `Bearer ${account.access_token}`
            }
          });
          
          if (userResponse.ok) {
            const userData = await userResponse.json();
            if (userData.nickname) {
              // Atualiza no banco
              await query(
                "UPDATE mercado_livre_credentials SET nickname = $1 WHERE user_id = $2 AND ml_user_id = $3",
                [userData.nickname, userId, account.ml_user_id]
              );
              // Atualiza o objeto local para retorno
              account.nickname = userData.nickname;
            }
          }
        } catch (err) {
          console.error(`Erro ao atualizar nickname para conta ${account.ml_user_id}:`, err);
        }
      }

      // Remove access_token do retorno
      const { access_token, ...safeAccount } = account;
      return safeAccount;
    }));

    return NextResponse.json({ 
      accounts: accounts
    });

  } catch (error) {
    console.error("Erro status ML:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}