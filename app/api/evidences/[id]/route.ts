import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";
import { unlink } from "fs/promises";
import path from "path";
import fs from "fs";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type DecodedToken = {
  userId: string;
};

const getTokenFromRequest = (request: NextRequest) => {
  const cookieToken = request.cookies.get("token")?.value;
  if (cookieToken) return cookieToken;
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) return authHeader.split(" ")[1];
  return null;
};

const authenticateAdmin = async (request: NextRequest) => {
  const token = getTokenFromRequest(request);
  if (!token) throw new Error("Token não informado");

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    const result = await query(
      "SELECT id, is_admin FROM users WHERE id = $1",
      [decoded.userId]
    );
    if (result.rowCount === 0 || !result.rows[0].is_admin) {
        throw new Error("Acesso negado: Perfil de Administrador necessário.");
    }
    return result.rows[0];
  } catch (err: any) {
    throw new Error(err.message || "Falha na autenticação");
  }
};

// DELETE /api/evidences/[id]
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        await authenticateAdmin(request);
        const { id } = await context.params;

        if (!id) {
            return NextResponse.json({ error: "ID inválido" }, { status: 400 });
        }

        // Recupera o nome do arquivo/url antes de apagar
        const selectResult = await query("SELECT file_url FROM evidences WHERE id = $1", [id]);
        
        if (selectResult.rowCount === 0) {
            return NextResponse.json({ error: "Evidência não encontrada" }, { status: 404 });
        }

        const evidence = selectResult.rows[0];

        // Apaga fisicamente do servidor
        try {
           const fileUrl = evidence.file_url;
           const fileName = fileUrl.split('/').pop();
           if (fileName) {
               const physicalPath = path.join(process.cwd(), "public", "uploads", "evidences", fileName);
               if (fs.existsSync(physicalPath)) {
                   await unlink(physicalPath);
               }
           }
        } catch(physicalError) {
           console.error("Aviso: Falha ao apagar físico da evidência " + id, physicalError);
        }

        // Apaga do Banco
        const result = await query("DELETE FROM evidences WHERE id = $1 RETURNING id", [id]);

        return NextResponse.json({ success: true, id: result.rows[0].id });

    } catch(error: any) {
        console.error("Delete evidence error:", error);
        if (error.message.includes("Acesso negado") || error.message.includes("autenticação")) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: "Erro interno no servidor ao excluir." }, { status: 500 });
    }
}

// PUT /api/evidences/[id]
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        await authenticateAdmin(request);
        const { id } = await context.params;

        if (!id) {
            return NextResponse.json({ error: "ID inválido" }, { status: 400 });
        }

        const body = await request.json();
        const description = body.description || null;

        const result = await query(
            "UPDATE evidences SET description = $1 WHERE id = $2 RETURNING *",
            [description, id]
        );

        if (result.rowCount === 0) {
            return NextResponse.json({ error: "Evidência não encontrada" }, { status: 404 });
        }

        return NextResponse.json({ success: true, evidence: result.rows[0] });

    } catch(error: any) {
        console.error("Update evidence error:", error);
        if (error.message.includes("Acesso negado") || error.message.includes("autenticação")) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: "Erro interno no servidor ao atualizar." }, { status: 500 });
    }
}
