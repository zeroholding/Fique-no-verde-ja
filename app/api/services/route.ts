import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { supabaseAdmin, query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type DecodedToken = {
  userId: string;
};

type ServiceRow = {
  id: string;
  name: string;
  description: string;
  base_price: string;
  sla: string;
  highlights: string[] | string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ServiceRangeRow = {
  id: string;
  service_id: string;
  sale_type: string;
  min_quantity: number;
  max_quantity: number | null;
  unit_price: string;
  effective_from: string;
};

type ServiceRangeResponse = {
  id: string;
  saleType: "01" | "02";
  minQuantity: number;
  maxQuantity: number | null;
  unitPrice: number;
  effectiveFrom: string;
};

type ServiceResponse = {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  sla: string;
  highlights: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  priceRanges: ServiceRangeResponse[];
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
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id, first_name, last_name, email, is_admin")
      .eq("id", decoded.userId)
      .single();

    if (error || !user) {
      throw new Error("Usuario nao encontrado");
    }
    return user;
  } catch (error) {
    console.error("Falha na autenticacao:", error);
    throw new Error("Falha na autenticacao");
  }
};

const authenticateAdmin = async (request: NextRequest) => {
  const user = await authenticateUser(request);
  if (!user.is_admin) {
    throw new Error("Usuario nao possui permissao administrativa");
  }
  return user;
};

const normalizeHighlights = (value: string[] | string | null): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      return value
        .split(",")
        .map((item) => item.replace(/^\[|\]$/g, "").trim())
        .filter(Boolean);
    }
  }
  return [];
};

const mapServiceRow = (row: ServiceRow) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  basePrice: Number(row.base_price ?? 0),
  sla: row.sla,
  highlights: normalizeHighlights(row.highlights),
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapServiceRangeRow = (row: ServiceRangeRow): ServiceRangeResponse => ({
  id: row.id,
  saleType: (row.sale_type as "01" | "02") ?? "01",
  minQuantity: row.min_quantity,
  maxQuantity: row.max_quantity,
  unitPrice: Number(row.unit_price ?? 0),
  effectiveFrom: row.effective_from,
});

const fetchServiceWithRanges = async (serviceId: string) => {
  const serviceResult = await query<ServiceRow>(
    `SELECT id, name, description, base_price, sla, highlights, is_active, created_at, updated_at
     FROM services WHERE id = $1`,
    [serviceId],
  );

  const serviceRow = serviceResult.rows[0];
  if (!serviceRow) {
    return null;
  }

  const rangesResult = await query<ServiceRangeRow>(
    `SELECT id, service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from
     FROM service_price_ranges
     WHERE service_id = $1
     ORDER BY sale_type, min_quantity`,
    [serviceId],
  );

  return {
    ...mapServiceRow(serviceRow),
    priceRanges: rangesResult.rows.map(mapServiceRangeRow),
  };
};

const saveServiceRanges = async (
  serviceId: string,
  ranges: Array<{
    saleType: "01" | "02";
    minQuantity: number;
    maxQuantity: number | null;
    unitPrice: number;
    effectiveFrom: string;
  }>,
) => {
  await query("DELETE FROM service_price_ranges WHERE service_id = $1", [
    serviceId,
  ]);

  for (const range of ranges) {
    await query(
      `INSERT INTO service_price_ranges
        (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        serviceId,
        range.saleType,
        range.minQuantity,
        range.maxQuantity,
        range.unitPrice,
        range.effectiveFrom,
      ],
    );
  }
};

const validateRangesPayload = (ranges: unknown) => {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    throw new Error("Informe pelo menos uma faixa de preco");
  }

  return ranges.map((item) => {
    const saleType: "01" | "02" = item?.saleType === "02" ? "02" : "01";
    const minQuantity = Number(item?.minQuantity ?? item?.minQty ?? 0);
    const maxValue = item?.maxQuantity ?? item?.maxQty;
    const maxQuantity =
      maxValue === null || maxValue === "" || maxValue === undefined
        ? null
        : Number(maxValue);
    const unitPrice = Number(item?.unitPrice ?? item?.price ?? 0);
    const effectiveFromRaw = item?.effectiveFrom ?? item?.effective_from;
    const effectiveDate = effectiveFromRaw
      ? new Date(effectiveFromRaw)
      : new Date();

    if (!Number.isFinite(minQuantity) || minQuantity < 1) {
      throw new Error("Quantidade minima invalida");
    }

    if (maxQuantity !== null) {
      if (!Number.isFinite(maxQuantity) || maxQuantity < minQuantity) {
        throw new Error(
          "Quantidade maxima deve ser maior ou igual a quantidade minima",
        );
      }
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error("Valor unitario invalido");
    }

    if (Number.isNaN(effectiveDate.getTime())) {
      throw new Error("Data de vigencia invalida");
    }

    return {
      saleType,
      minQuantity,
      maxQuantity,
      unitPrice,
      effectiveFrom: effectiveDate.toISOString().slice(0, 10),
    };
  });
};

export async function GET(request: NextRequest) {
  try {
    await authenticateUser(request);
    const includeInactive =
      request.nextUrl.searchParams.get("includeInactive") === "true";

    const services = await query<ServiceRow>(
      `SELECT id, name, description, base_price, sla, highlights, is_active, created_at, updated_at
       FROM services
       ${includeInactive ? "" : "WHERE is_active = true"}
       ORDER BY name ASC`,
    );

    const serviceRows = services.rows.map(mapServiceRow);
    const serviceIds = serviceRows.map((service: any) => service.id);

    const rangesMap = new Map<string, ServiceRangeResponse[]>();

    if (serviceIds.length > 0) {
      const rangesResult = await query<ServiceRangeRow>(
        `SELECT id, service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from
         FROM service_price_ranges
         WHERE service_id = ANY($1::uuid[])
         ORDER BY sale_type, min_quantity`,
        [serviceIds],
      );

      for (const rangeRow of rangesResult.rows) {
        const mapped = mapServiceRangeRow(rangeRow);
        const current = rangesMap.get(rangeRow.service_id) ?? [];
        current.push(mapped);
        rangesMap.set(rangeRow.service_id, current);
      }
    }

    return NextResponse.json(
      {
        services: serviceRows.map((service: any) => ({
          ...service,
          priceRanges: rangesMap.get(service.id) ?? [],
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao carregar servicos";
    const status = message.includes("autenticacao") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    const body = await request.json();
    const {
      name,
      description,
      basePrice,
      sla,
      highlights,
      isActive,
      priceRanges,
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Nome do servico e obrigatorio" },
        { status: 400 },
      );
    }
    if (!description || !description.trim()) {
      return NextResponse.json(
        { error: "Descricao do servico e obrigatoria" },
        { status: 400 },
      );
    }
    if (!sla || !sla.trim()) {
      return NextResponse.json(
        { error: "SLA do servico e obrigatorio" },
        { status: 400 },
      );
    }

    const numericBasePrice = Number(basePrice ?? 0);
    if (Number.isNaN(numericBasePrice) || numericBasePrice < 0) {
      return NextResponse.json(
        { error: "Valor base invalido" },
        { status: 400 },
      );
    }

    let parsedRanges: ReturnType<typeof validateRangesPayload>;
    try {
      parsedRanges = validateRangesPayload(priceRanges);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Faixas invalidas" },
        { status: 400 },
      );
    }

    const normalizedHighlights = Array.isArray(highlights)
      ? highlights.map((item: string) => item.trim()).filter(Boolean)
      : [];

    await query("BEGIN");
    try {
      const result = await query<ServiceRow>(
        `INSERT INTO services (name, description, base_price, sla, highlights, is_active)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         RETURNING id`,
        [
          name.trim(),
          description.trim(),
          numericBasePrice,
          sla.trim(),
          JSON.stringify(normalizedHighlights),
          isActive ?? true,
        ],
      );

      const serviceId = result.rows[0].id;
      await saveServiceRanges(serviceId, parsedRanges);
      await query("COMMIT");

      const service = await fetchServiceWithRanges(serviceId);
      if (!service) {
        throw new Error("Servico nao encontrado apos criacao");
      }

      return NextResponse.json(
        {
          service,
          message: "Servico criado com sucesso",
        },
        { status: 201 },
      );
    } catch (dbError) {
      await query("ROLLBACK");
      throw dbError;
    }
  } catch (error) {
    console.error("Erro ao criar servico:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao criar servico";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    const body = await request.json();
    const {
      id,
      name,
      description,
      basePrice,
      sla,
      highlights,
      isActive,
      priceRanges,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID do servico e obrigatorio" },
        { status: 400 },
      );
    }
    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Nome do servico e obrigatorio" },
        { status: 400 },
      );
    }
    if (!description || !description.trim()) {
      return NextResponse.json(
        { error: "Descricao do servico e obrigatoria" },
        { status: 400 },
      );
    }
    if (!sla || !sla.trim()) {
      return NextResponse.json(
        { error: "SLA do servico e obrigatorio" },
        { status: 400 },
      );
    }

    const numericBasePrice = Number(basePrice ?? 0);
    if (Number.isNaN(numericBasePrice) || numericBasePrice < 0) {
      return NextResponse.json(
        { error: "Valor base invalido" },
        { status: 400 },
      );
    }

    let parsedRanges: ReturnType<typeof validateRangesPayload>;
    try {
      parsedRanges = validateRangesPayload(priceRanges);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Faixas invalidas" },
        { status: 400 },
      );
    }

    const normalizedHighlights = Array.isArray(highlights)
      ? highlights.map((item: string) => item.trim()).filter(Boolean)
      : [];

    await query("BEGIN");
    try {
      const result = await query(
        `UPDATE services
         SET name = $1,
             description = $2,
             base_price = $3,
             sla = $4,
             highlights = $5::jsonb,
             is_active = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7
         RETURNING id`,
        [
          name.trim(),
          description.trim(),
          numericBasePrice,
          sla.trim(),
          JSON.stringify(normalizedHighlights),
          isActive ?? true,
          id,
        ],
      );

      if (result.rowCount === 0) {
        await query("ROLLBACK");
        return NextResponse.json(
          { error: "Servico nao encontrado" },
          { status: 404 },
        );
      }

      await saveServiceRanges(id, parsedRanges);
      await query("COMMIT");

      const service = await fetchServiceWithRanges(id);
      if (!service) {
        throw new Error("Servico nao encontrado apos atualizacao");
      }

      return NextResponse.json(
        {
          service,
          message: "Servico atualizado com sucesso",
        },
        { status: 200 },
      );
    } catch (dbError) {
      await query("ROLLBACK");
      throw dbError;
    }
  } catch (error) {
    console.error("Erro ao atualizar servico:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao atualizar servico";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "ID do servico e obrigatorio" },
        { status: 400 },
      );
    }

    const result = await query(
      "DELETE FROM services WHERE id = $1 RETURNING id",
      [id],
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Servico nao encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { success: true, message: "Servico removido com sucesso" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Erro ao remover servico:", error);
    const message =
      error instanceof Error ? error.message : "Erro ao remover servico";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
