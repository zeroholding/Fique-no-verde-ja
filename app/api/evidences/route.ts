import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
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

const authenticateUser = async (request: NextRequest) => {
  const token = getTokenFromRequest(request);
  if (!token) throw new Error("Token não informado");

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    const result = await query(
      "SELECT id, first_name, last_name, email, is_admin FROM users WHERE id = $1",
      [decoded.userId]
    );
    if (result.rowCount === 0) throw new Error("Usuário não encontrado");
    return result.rows[0];
  } catch (err) {
    throw new Error("Falha na autenticação");
  }
};

const authenticateAdmin = async (request: NextRequest) => {
  const user = await authenticateUser(request);
  if (!user.is_admin) throw new Error("Acesso negado: Perfil de Administrador necessário.");
  return user;
};

// GET: Recupera evidences de um determinado mês e ano (ou de uma data especifica)
export async function GET(request: NextRequest) {
  try {
    await authenticateUser(request); // Usuários normais também veem
    
    // Parâmetros opcionais para filtrar o intervalo
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const date = searchParams.get("date");

    let sql = `
       SELECT e.*, u.first_name || ' ' || u.last_name as creator_name
       FROM evidences e
       LEFT JOIN users u ON e.created_by_user_id = u.id
       WHERE 1=1
    `;
    const params: any[] = [];
    let queryIndex = 1;

    if (date) {
      sql += ` AND e.date = $${queryIndex++}`;
      params.push(date);
    } else if (start && end) {
      sql += ` AND e.date >= $${queryIndex++} AND e.date <= $${queryIndex++}`;
      params.push(start, end);
    }

    sql += " ORDER BY e.created_at DESC";

    const result = await query(sql, params);

    // Converter para evitar problemas timezone no JSON
    const evidences = result.rows.map(row => ({
      ...row,
      date: new Date(row.date).toISOString().split('T')[0] // Formato YYYY-MM-DD
    }));

    return NextResponse.json({ evidences }, { status: 200 });

  } catch (error: any) {
    if (error.message.includes("Acesso negado") || error.message.includes("autenticação")) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Erro interno no servidor ao listar evidências" }, { status: 500 });
  }
}

// Aumenta o limite de body da requisição (padrão Next.js é 4MB)
export const config = {
  api: {
    bodyParser: false, // FormData gerencia internamente
    responseLimit: false,
  },
};

// Next.js App Router: define o tamanho máximo permitido para uploads
export const maxDuration = 60; // segundos

// POST: Realiza Upload Multipart
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateAdmin(request); // Apenas admins fazem upload

    const formData = await request.formData();
    const date = formData.get("date") as string;
    const description = formData.get("description") as string || null;
    const files = formData.getAll("files") as File[];

    if (!date) {
      return NextResponse.json({ error: "Data não fornecida." }, { status: 400 });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "evidences");
    
    // Garante que o diretório exista silenciosamente
    if (!fs.existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const savedRecords = [];

    // Processa cada arquivo individualmente para insert no DB
    for (const file of files) {
      if (!(file instanceof File)) continue;
      
      const fileExt = path.extname(file.name).toLowerCase();
      // Anti colisão
      const randomName = crypto.randomUUID() + fileExt;
      const physicalPath = path.join(uploadDir, randomName);
      
      // Converte o arquivo em buffer nativo do node
      const buffer = Buffer.from(await file.arrayBuffer());
      
      // Escreve fisicamente
      await writeFile(physicalPath, buffer);
      
      const fileUrl = `/api/media/evidences/${randomName}`; // Como será acessado pelo navegador (static folder fallback bypass)

      // Grava no PostgreSQL
      const result = await query(
         `INSERT INTO evidences (date, file_name, file_url, file_type, file_size, description, created_by_user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
         [
            date,
            file.name.substring(0, 250),
            fileUrl,
            file.type,
            file.size,
            description,
            user.id
         ]
      );

      savedRecords.push(result.rows[0]);
    }

    return NextResponse.json({ success: true, uploadedItems: savedRecords }, { status: 201 });

  } catch (error: any) {
    console.error("Upload evidence error:", error);
    if (error.message.includes("Acesso negado") || error.message.includes("autenticação")) {
        return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erro interno no servidor ao enviar arquivos. Detalhe: " + (error.message || String(error)) }, { status: 500 });
  }
}
