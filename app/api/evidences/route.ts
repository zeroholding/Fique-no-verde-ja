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

    const uploadDir = path.join(process.cwd(), "public", "uploads", "evidences");
    if (!fs.existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const savedRecords = [];
    const uploadType = request.headers.get("x-upload-type");

    if (uploadType === "raw") {
        const fileNameHeader = request.headers.get("x-file-name") || "upload.bin";
        const fileName = decodeURIComponent(fileNameHeader);
        const date = request.headers.get("x-file-date");
        const descHeader = request.headers.get("x-file-description");
        const description = descHeader ? decodeURIComponent(descHeader) : null;
        const fileType = request.headers.get("content-type") || "application/octet-stream";
        const fileSizeHeader = request.headers.get("content-length") || "0";
        const fileSize = parseInt(fileSizeHeader, 10);

        if (!date) return NextResponse.json({ error: "Data não fornecida." }, { status: 400 });
        if (!request.body) return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });

        const fileExt = path.extname(fileName).toLowerCase();
        const randomName = crypto.randomUUID() + fileExt;
        const physicalPath = path.join(uploadDir, randomName);
        const fileUrl = `/api/media/evidences/${randomName}`;

        // Salvar via Buffer direto (bypassa limite do parser de FormData do Nextjs)
        const arrayBuffer = await request.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await writeFile(physicalPath, buffer);

        const result = await query(
           `INSERT INTO evidences (date, file_name, file_url, file_type, file_size, description, created_by_user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
           [date, fileName.substring(0, 250), fileUrl, fileType, fileSize, description, user.id]
        );
        const savedEvidence = result.rows[0];
        savedRecords.push(savedEvidence);

        // Auto-Migration garantida para logs (fallback)
        try {
           await query(`CREATE TABLE IF NOT EXISTS evidence_logs (id SERIAL PRIMARY KEY, evidence_id UUID NOT NULL, user_id VARCHAR(255) NOT NULL, action VARCHAR(50) NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`);
           await query(`ALTER TABLE evidence_logs ADD COLUMN IF NOT EXISTS file_name VARCHAR(255)`);
           await query(`ALTER TABLE evidence_logs ADD COLUMN IF NOT EXISTS file_type VARCHAR(100)`);
           await query(`ALTER TABLE evidence_logs ADD COLUMN IF NOT EXISTS evidence_date DATE`);
        } catch(e) {}

        // Log the upload action
        try {
            await query(
                `INSERT INTO evidence_logs (evidence_id, user_id, action, file_name, file_type, evidence_date) VALUES ($1, $2, $3, $4, $5, $6)`,
                [savedEvidence.id, user.id, 'upload', savedEvidence.file_name, savedEvidence.file_type, savedEvidence.date]
            );
        } catch(e) {
            console.error("Erro ao gerar log de upload:", e);
        }

    } else {
        // Fallback p/ FormData legado
        const formData = await request.formData();
        const date = formData.get("date") as string;
        const description = formData.get("description") as string || null;
        const files = formData.getAll("files") as File[];

        if (!date) return NextResponse.json({ error: "Data não fornecida." }, { status: 400 });
        if (!files || files.length === 0) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });

        for (const file of files) {
          if (!(file instanceof File)) continue;
          const fileExt = path.extname(file.name).toLowerCase();
          const randomName = crypto.randomUUID() + fileExt;
          const physicalPath = path.join(uploadDir, randomName);
          const buffer = Buffer.from(await file.arrayBuffer());
          await writeFile(physicalPath, buffer);
          const fileUrl = `/api/media/evidences/${randomName}`;
          const result = await query(
             `INSERT INTO evidences (date, file_name, file_url, file_type, file_size, description, created_by_user_id)
              VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
             [date, file.name.substring(0, 250), fileUrl, file.type, file.size, description, user.id]
          );
          savedRecords.push(result.rows[0]);
        }
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
