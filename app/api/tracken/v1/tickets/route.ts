import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest, getClientIp } from "@/lib/tracken/auth";
import { logTrackenRequest, trackenQuery } from "@/lib/tracken/db";
import {
  badRequest,
  payloadTooLarge,
  toErrorResponse,
} from "@/lib/tracken/errors";
import { createTicketsBatch } from "@/lib/tracken/tickets";
import {
  MAX_BATCH_ITEMS,
  extractItems,
  validateIncomingItem,
  type NormalizedItem,
} from "@/lib/tracken/validation";
import type { TrackenItemResult } from "@/lib/tracken/types";

/**
 * API publica da integracao Tracken.
 * Autenticada por credencial de maquina, nunca por sessao de usuario.
 *
 * POST /api/tracken/v1/tickets  -> cria um ou varios atendimentos
 * GET  /api/tracken/v1/tickets  -> lista atendimentos
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ENDPOINT = "/api/tracken/v1/tickets";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let credentialId: string | null = null;

  try {
    // O corpo bruto e necessario para validar a assinatura HMAC.
    const rawBody = await request.text();

    const credential = await authenticateMachineRequest(request, {
      rawBody,
      requiredScope: "tickets:write",
    });
    credentialId = credential.id;

    if (!rawBody.trim()) {
      throw badRequest("EMPTY_BODY", "Corpo da requisicao vazio");
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      throw badRequest("INVALID_JSON", "Corpo da requisicao nao e um JSON valido");
    }

    const rawItems = extractItems(parsedBody);
    if (!rawItems) {
      throw badRequest(
        "INVALID_PAYLOAD",
        'Envie { "items": [...] } com os envios a processar'
      );
    }
    if (rawItems.length === 0) {
      throw badRequest("EMPTY_BATCH", "Nenhum envio informado em items");
    }
    if (rawItems.length > MAX_BATCH_ITEMS) {
      throw payloadTooLarge(
        `Lote acima do limite de ${MAX_BATCH_ITEMS} itens por chamada`
      );
    }

    // Falha parcial e permitida: itens invalidos sao rejeitados
    // individualmente e os validos seguem para gravacao.
    const validItems: Array<{ normalized: NormalizedItem; rawPayload: unknown }> =
      [];
    const rejectedUpfront: TrackenItemResult[] = [];
    const seenInBatch = new Set<string>();

    rawItems.forEach((rawItem, index) => {
      const validation = validateIncomingItem(rawItem);

      if (!validation.ok) {
        const shipmentId =
          typeof (rawItem as { shipment_id?: unknown })?.shipment_id === "string"
            ? ((rawItem as { shipment_id: string }).shipment_id)
            : `items[${index}]`;

        rejectedUpfront.push({
          shipment_id: shipmentId,
          status: "rejected",
          code: validation.code,
          message: validation.message,
        });
        return;
      }

      // Repeticao dentro do proprio lote: mantem a primeira ocorrencia.
      if (seenInBatch.has(validation.value.shipmentId)) {
        rejectedUpfront.push({
          shipment_id: validation.value.shipmentId,
          status: "rejected",
          code: "DUPLICATED_IN_BATCH",
          message: "shipment_id repetido no mesmo lote",
        });
        return;
      }

      seenInBatch.add(validation.value.shipmentId);
      validItems.push({ normalized: validation.value, rawPayload: rawItem });
    });

    const outcome =
      validItems.length > 0
        ? await createTicketsBatch(validItems, { credentialId: credential.id })
        : {
            received: 0,
            created: 0,
            duplicated: 0,
            rejected: 0,
            results: [] as TrackenItemResult[],
          };

    const body = {
      received: rawItems.length,
      created: outcome.created,
      duplicated: outcome.duplicated,
      rejected: outcome.rejected + rejectedUpfront.length,
      results: [...outcome.results, ...rejectedUpfront],
    };

    await logTrackenRequest({
      direction: "inbound",
      endpoint: ENDPOINT,
      httpMethod: "POST",
      httpStatus: 200,
      credentialId: credential.id,
      requestBody: { items_count: rawItems.length },
      responseBody: {
        created: body.created,
        duplicated: body.duplicated,
        rejected: body.rejected,
      },
      durationMs: Date.now() - startedAt,
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    const response = toErrorResponse(error);

    await logTrackenRequest({
      direction: "inbound",
      endpoint: ENDPOINT,
      httpMethod: "POST",
      httpStatus: response.status,
      credentialId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Erro desconhecido",
      ipAddress: getClientIp(request),
    });

    return response;
  }
}

type PublicTicketRow = {
  shipment_id: string;
  order_id: string;
  carrier_code: string | null;
  status: string;
  status_label: string | null;
  service_type: string;
  seller_name: string;
  sale_date: string;
  shipping_deadline: string | null;
  received_at: string;
  started_at: string | null;
  finished_at: string | null;
  ml_claim_id: string | null;
};

export async function GET(request: NextRequest) {
  try {
    await authenticateMachineRequest(request, {
      rawBody: "",
      requiredScope: "tickets:read",
    });

    const { searchParams } = new URL(request.url);
    const conditions: string[] = [];
    const params: unknown[] = [];

    const status = searchParams.get("status");
    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }

    const carrierCode = searchParams.get("carrier_code");
    if (carrierCode) {
      params.push(carrierCode.toUpperCase());
      conditions.push(`c.code = $${params.length}`);
    }

    const from = searchParams.get("from");
    if (from) {
      params.push(from);
      conditions.push(`t.received_at >= $${params.length}::timestamptz`);
    }

    const to = searchParams.get("to");
    if (to) {
      params.push(to);
      conditions.push(`t.received_at <= $${params.length}::timestamptz`);
    }

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(searchParams.get("page_size")) || 50)
    );

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const totalResult = await trackenQuery<{ total: string }>(
      `SELECT COUNT(*)::text AS total
         FROM tracken_tickets t
         LEFT JOIN tracken_carriers c ON c.id = t.carrier_id
         ${whereClause}`,
      params
    );

    const listParams = [...params, pageSize, (page - 1) * pageSize];
    const rows = await trackenQuery<PublicTicketRow>(
      `SELECT t.shipment_id, t.order_id, c.code AS carrier_code, t.status,
              sm.label AS status_label, t.service_type, t.seller_name,
              t.sale_date, t.shipping_deadline, t.received_at,
              t.started_at, t.finished_at, t.ml_claim_id
         FROM tracken_tickets t
         LEFT JOIN tracken_carriers c ON c.id = t.carrier_id
         LEFT JOIN tracken_status_map sm ON sm.code = t.status
         ${whereClause}
         ORDER BY t.received_at DESC
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    return NextResponse.json({
      total: Number(totalResult.rows[0]?.total ?? 0),
      page,
      page_size: pageSize,
      items: rows.rows,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
