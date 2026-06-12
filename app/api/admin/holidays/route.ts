import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthErrorStatus, requireAdmin } from "@/lib/server-auth";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const yearParam = new URL(request.url).searchParams.get("year");
    const year = yearParam ? Number(yearParam) : null;

    const params: unknown[] = [];
    let whereClause = "";
    if (year && Number.isInteger(year) && year >= 2000 && year <= 2100) {
      params.push(year);
      whereClause = "WHERE EXTRACT(YEAR FROM date) = $1";
    }

    const result = await query(
      `SELECT id, date, name, is_national, is_active, created_at, updated_at
       FROM holidays
       ${whereClause}
       ORDER BY date ASC`,
      params,
    );

    return NextResponse.json({ holidays: result.rows });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao listar feriados";
    const status = getAuthErrorStatus(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const date = String(body.date || "");
    const name = String(body.name || "").trim();
    const isNational = body.isNational !== false;

    if (!datePattern.test(date) || !name) {
      return NextResponse.json(
        { error: "Data e nome do feriado sao obrigatorios" },
        { status: 400 },
      );
    }

    const result = await query(
      `INSERT INTO holidays (date, name, is_national, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (date) DO UPDATE
       SET name = EXCLUDED.name,
           is_national = EXCLUDED.is_national,
           is_active = true,
           updated_at = CURRENT_TIMESTAMP
       RETURNING id, date, name, is_national, is_active`,
      [date, name, isNational],
    );

    return NextResponse.json(
      { success: true, holiday: result.rows[0] },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao salvar feriado";
    return NextResponse.json(
      { error: message },
      { status: getAuthErrorStatus(error) },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const id = String(body.id || "");
    const date = String(body.date || "");
    const name = String(body.name || "").trim();
    const isNational = body.isNational !== false;
    const isActive = body.isActive !== false;

    if (!id || !datePattern.test(date) || !name) {
      return NextResponse.json(
        { error: "ID, data e nome do feriado sao obrigatorios" },
        { status: 400 },
      );
    }

    const result = await query(
      `UPDATE holidays
       SET date = $1,
           name = $2,
           is_national = $3,
           is_active = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, date, name, is_national, is_active`,
      [date, name, isNational, isActive, id],
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Feriado nao encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, holiday: result.rows[0] });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao atualizar feriado";
    return NextResponse.json(
      { error: message },
      { status: getAuthErrorStatus(error) },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "ID do feriado nao informado" },
        { status: 400 },
      );
    }

    const result = await query(
      `UPDATE holidays
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id`,
      [id],
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Feriado nao encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao desativar feriado";
    return NextResponse.json(
      { error: message },
      { status: getAuthErrorStatus(error) },
    );
  }
}
