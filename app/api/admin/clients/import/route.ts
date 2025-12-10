import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import * as XLSX from "xlsx";

type ClientRow = {
  nome: string;
  telefone?: string;
  email?: string;
  cpf_cnpj?: string;
  data_nascimento?: string;
  origem?: string;
};

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Token de autenticacao ausente ou invalido" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decoded = await verifyToken(token);

    if (!decoded || typeof decoded === "string") {
      return NextResponse.json(
        { error: "Token invalido ou expirado" },
        { status: 401 }
      );
    }

    const currentUserId = decoded.userId as string;

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo foi enviado" },
        { status: 400 }
      );
    }

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      return NextResponse.json(
        { error: "O arquivo deve estar no formato .xlsx ou .xls" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json(
        { error: "O arquivo Excel nao possui planilhas" },
        { status: 400 }
      );
    }

    const worksheet = workbook.Sheets[sheetName];

    const data = XLSX.utils.sheet_to_json<ClientRow>(worksheet, {
      defval: null,
      raw: false,
    });

    if (data.length === 0) {
      return NextResponse.json(
        { error: "O arquivo Excel esta vazio" },
        { status: 400 }
      );
    }

    const parseBirthDate = (value: unknown) => {
      if (!value || value.toString().trim() === "") {
        return { date: null as string | null, error: null as string | null };
      }

      if (typeof value === "number") {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed && parsed.y && parsed.m && parsed.d) {
          const y = parsed.y.toString().padStart(4, "0");
          const m = parsed.m.toString().padStart(2, "0");
          const d = parsed.d.toString().padStart(2, "0");
          return { date: `${y}-${m}-${d}`, error: null };
        }
      }

      if (value instanceof Date && !isNaN(value.getTime())) {
        const y = value.getFullYear().toString().padStart(4, "0");
        const m = (value.getMonth() + 1).toString().padStart(2, "0");
        const d = value.getDate().toString().padStart(2, "0");
        return { date: `${y}-${m}-${d}`, error: null };
      }

      const str = value.toString().trim();
      const firstToken = str.split(/\s+/)[0];
      const normalized = firstToken.replace(/[.]/g, "/").replace(/-/g, "/");

      const ymd = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (ymd) {
        const [, year, month, day] = ymd;
        return {
          date: `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
          error: null,
        };
      }

      const dmy = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmy) {
        const [, day, month, year] = dmy;
        return {
          date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
          error: null,
        };
      }

      const digits = normalized.replace(/\D/g, "");
      if (digits.length === 8) {
        const day = digits.slice(0, 2);
        const month = digits.slice(2, 4);
        const year = digits.slice(4);
        return {
          date: `${year}-${month}-${day}`,
          error: null,
        };
      }

      // Tentar ISO direto (Date.parse) por ultimo
      const parsed = Date.parse(str);
      if (!Number.isNaN(parsed)) {
        const d = new Date(parsed);
        const y = d.getFullYear().toString().padStart(4, "0");
        const m = (d.getMonth() + 1).toString().padStart(2, "0");
        const day = d.getDate().toString().padStart(2, "0");
        return { date: `${y}-${m}-${day}`, error: null };
      }

      return {
        date: null,
        error: "Data de nascimento invalida. Use o formato DD/MM/AAAA",
      };
    };

    const normalize = (value: unknown) =>
      value === undefined || value === null ? "" : value.toString().trim();

    const onlyDigits = (value: string | null) =>
      value ? value.replace(/\D/g, "") : null;

    let importedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // linha 1 e cabecalho

      try {
        const allEmpty =
          normalize(row.nome) === "" &&
          normalize(row.telefone) === "" &&
          normalize(row.email) === "" &&
          normalize(row.cpf_cnpj) === "" &&
          normalize(row.data_nascimento) === "" &&
          normalize(row.origem) === "";

        if (allEmpty) continue;

        if (normalize(row.nome) === "") {
          errors.push(`Linha ${rowNumber}: Nome do cliente e obrigatorio`);
          continue;
        }

        const clientName = normalize(row.nome);
        const phone = normalize(row.telefone) || null;
        const email = normalize(row.email) || null;
        const cpfCnpj = onlyDigits(normalize(row.cpf_cnpj) || null);
        const originName = normalize(row.origem) || null;

        const parsedBirth = parseBirthDate(row.data_nascimento);
        if (parsedBirth.error) {
          errors.push(`Linha ${rowNumber}: ${parsedBirth.error}`);
          continue;
        }
        const birthDate = parsedBirth.date;

        if (email) {
          const emailCheckResult = await query(
            "SELECT id FROM clients WHERE email = $1 AND created_by_user_id = $2 LIMIT 1",
            [email, currentUserId]
          );

          if (emailCheckResult.rows.length > 0) {
            errors.push(
              `Linha ${rowNumber}: Ja existe um cliente com o email "${email}"`
            );
            continue;
          }
        }

        if (cpfCnpj) {
          const cpfCheckResult = await query(
            "SELECT id FROM clients WHERE cpf_cnpj = $1 AND created_by_user_id = $2 LIMIT 1",
            [cpfCnpj, currentUserId]
          );

          if (cpfCheckResult.rows.length > 0) {
            errors.push(
              `Linha ${rowNumber}: Ja existe um cliente com o CPF/CNPJ "${cpfCnpj}"`
            );
            continue;
          }
        }

        let originId: string | null = null;
        if (originName) {
          try {
            const originResult = await query(
              "SELECT id FROM origins WHERE LOWER(name) = LOWER($1) LIMIT 1",
              [originName]
            );

            if (originResult.rows.length > 0) {
              originId = originResult.rows[0].id;
            } else {
              const newOriginResult = await query(
                "INSERT INTO origins (name) VALUES ($1) RETURNING id",
                [originName]
              );
              originId = newOriginResult.rows[0].id;
            }
          } catch (err: any) {
            // Se a tabela de origens n�o existir, seguimos sem origem
            if (err?.code === "42P01") {
              console.warn("Tabela origins ausente; seguindo sem origem");
              originId = null;
            } else {
              throw err;
            }
          }
        }

        await query(
          `INSERT INTO clients (
            name, phone, email, cpf_cnpj, birth_date, origin_id, is_active, created_by_user_id
          ) VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
          [clientName, phone, email, cpfCnpj, birthDate, originId, currentUserId]
        );

        importedCount++;
      } catch (error) {
        console.error(`Erro ao processar linha ${rowNumber}:`, error);
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "string"
            ? error
            : JSON.stringify(error);
        errors.push(`Linha ${rowNumber}: Erro ao processar - ${message}`);
      }
    }

    if (importedCount === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          error: "Nenhum cliente foi importado. Verifique os erros abaixo:",
          details: errors.slice(0, 10),
          totalErrors: errors.length,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      imported: importedCount,
      total: data.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      totalErrors: errors.length,
    });
  } catch (error) {
    console.error("Erro ao importar clientes:", error);
    return NextResponse.json(
      {
        error: "Erro ao importar clientes",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}
