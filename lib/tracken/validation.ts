import { normalizeShippingMode } from "./shipping";
import type {
  TrackenIncomingItem,
  TrackenServiceType,
} from "./types";

/**
 * Validacao manual do payload da Tracken.
 * O projeto nao usa zod, entao a checagem segue o padrao dos demais
 * route handlers: verificacoes explicitas com mensagem de erro utilizavel.
 */

export const MAX_BATCH_ITEMS = 200;

const SERVICE_TYPES: TrackenServiceType[] = [
  "atraso",
  "reclamacao",
  "cancelado",
];

const IDENTIFIER_REGEX = /^[A-Za-z0-9._-]{1,80}$/;

export type NormalizedItem = {
  shipmentId: string;
  orderId: string;
  carrierCode: string;
  serviceType: TrackenServiceType;
  buyerNickname: string | null;
  buyerName: string | null;
  sellerName: string;
  sellerMlId: string | null;
  saleDate: Date;
  shippingDeadline: Date | null;
  /** Data em que o envio de fato saiu. */
  shippedAt: Date | null;
  /** Modalidade logistica do ML (self_service = FLEX). */
  shippingMode: string | null;
  trackingNumber: string | null;
  packId: string | null;
  delayReason: string | null;
  requestedBy: string | null;
  trackenRef: string | null;
};

export type ItemValidation =
  | { ok: true; value: NormalizedItem }
  | { ok: false; code: string; message: string };

const asTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const truncate = (value: string | null, max: number): string | null =>
  value === null ? null : value.slice(0, max);

const parseDate = (value: unknown): Date | null => {
  const raw = asTrimmedString(value);
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Valida e normaliza um envio recebido da Tracken. */
export function validateIncomingItem(input: unknown): ItemValidation {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      ok: false,
      code: "INVALID_ITEM",
      message: "Item deve ser um objeto",
    };
  }

  const item = input as TrackenIncomingItem;

  const shipmentId = asTrimmedString(item.shipment_id);
  if (!shipmentId) {
    return {
      ok: false,
      code: "INVALID_SHIPMENT_ID",
      message: "shipment_id e obrigatorio",
    };
  }
  if (!IDENTIFIER_REGEX.test(shipmentId)) {
    return {
      ok: false,
      code: "INVALID_SHIPMENT_ID",
      message: "shipment_id possui caracteres invalidos ou excede 80 caracteres",
    };
  }

  const orderId = asTrimmedString(item.order_id);
  if (!orderId) {
    return {
      ok: false,
      code: "INVALID_ORDER_ID",
      message: "order_id e obrigatorio",
    };
  }
  if (!IDENTIFIER_REGEX.test(orderId)) {
    return {
      ok: false,
      code: "INVALID_ORDER_ID",
      message: "order_id possui caracteres invalidos ou excede 80 caracteres",
    };
  }

  const carrierCode = asTrimmedString(item.carrier_code);
  if (!carrierCode) {
    return {
      ok: false,
      code: "INVALID_CARRIER",
      message: "carrier_code e obrigatorio",
    };
  }

  const rawServiceType = asTrimmedString(item.service_type)?.toLowerCase();
  const serviceType = (rawServiceType ?? "atraso") as TrackenServiceType;
  if (!SERVICE_TYPES.includes(serviceType)) {
    return {
      ok: false,
      code: "INVALID_SERVICE_TYPE",
      message: `service_type deve ser um de: ${SERVICE_TYPES.join(", ")}`,
    };
  }

  const sellerName = asTrimmedString(item.seller?.name);
  if (!sellerName) {
    return {
      ok: false,
      code: "INVALID_SELLER",
      message: "seller.name e obrigatorio",
    };
  }

  const saleDate = parseDate(item.sale_date);
  if (!saleDate) {
    return {
      ok: false,
      code: "INVALID_SALE_DATE",
      message: "sale_date e obrigatoria e deve estar em ISO 8601 com offset",
    };
  }

  let shippingDeadline: Date | null = null;
  if (item.shipping_deadline !== undefined && item.shipping_deadline !== null) {
    shippingDeadline = parseDate(item.shipping_deadline);
    if (!shippingDeadline) {
      return {
        ok: false,
        code: "INVALID_SHIPPING_DEADLINE",
        message: "shipping_deadline deve estar em ISO 8601 com offset",
      };
    }
  }

  let shippedAt: Date | null = null;
  if (item.shipped_at !== undefined && item.shipped_at !== null) {
    shippedAt = parseDate(item.shipped_at);
    if (!shippedAt) {
      return {
        ok: false,
        code: "INVALID_SHIPPED_AT",
        message: "shipped_at deve estar em ISO 8601 com offset",
      };
    }
  }

  return {
    ok: true,
    value: {
      shipmentId,
      orderId,
      carrierCode: carrierCode.toUpperCase(),
      serviceType,
      buyerNickname: truncate(asTrimmedString(item.buyer?.nickname), 200),
      buyerName: truncate(asTrimmedString(item.buyer?.name), 200),
      sellerName: sellerName.slice(0, 200),
      sellerMlId: truncate(asTrimmedString(item.seller?.ml_id), 80),
      saleDate,
      shippingDeadline,
      shippedAt,
      shippingMode: normalizeShippingMode(item.shipping_mode),
      trackingNumber: truncate(asTrimmedString(item.tracking_number), 120),
      packId: truncate(asTrimmedString(item.pack_id), 80),
      delayReason: asTrimmedString(item.delay_reason),
      requestedBy: truncate(asTrimmedString(item.requested_by), 200),
      trackenRef: truncate(asTrimmedString(item.tracken_ref), 120),
    },
  };
}

/**
 * Aceita `{ items: [...] }`, um array direto ou um objeto unico.
 * Enviar sempre array e o formato documentado, mas tolerar as outras formas
 * evita atrito na integracao.
 */
export function extractItems(body: unknown): unknown[] | null {
  if (Array.isArray(body)) {
    return body;
  }
  if (typeof body === "object" && body !== null) {
    const container = body as { items?: unknown };
    if (Array.isArray(container.items)) {
      return container.items;
    }
    return [body];
  }
  return null;
}
