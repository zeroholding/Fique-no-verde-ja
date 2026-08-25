import type { PoolClient } from "pg";
import { trackenQuery, withTransaction } from "./db";
import { TrackenApiError, notFound, unprocessable } from "./errors";
import type {
  TrackenCarrierRow,
  TrackenItemResult,
  TrackenStatusRow,
} from "./types";
import type { NormalizedItem } from "./validation";

/** Regra de negocio do atendimento Tracken. */

export async function getStatusMap(): Promise<TrackenStatusRow[]> {
  const result = await trackenQuery<TrackenStatusRow>(
    `SELECT code, label, tracken_status, color, sort_order,
            is_initial, is_final, counts_as_sla, allowed_next
       FROM tracken_status_map
      WHERE is_active = true
      ORDER BY sort_order`
  );
  return result.rows;
}

export async function getCarriers(): Promise<TrackenCarrierRow[]> {
  const result = await trackenQuery<TrackenCarrierRow>(
    `SELECT id, code, name, color, is_active
       FROM tracken_carriers
      WHERE is_active = true
      ORDER BY code`
  );
  return result.rows;
}

/** Enfileira uma notificacao para a Tracken dentro da transacao corrente. */
export async function enqueueOutboxEvent(
  client: PoolClient,
  ticketId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  await client.query(
    `INSERT INTO tracken_outbox (ticket_id, event_type, payload)
     VALUES ($1, $2, $3::jsonb)`,
    [ticketId, eventType, JSON.stringify(payload)]
  );
}

async function recordEvent(
  client: PoolClient,
  entry: {
    ticketId: string;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    actorType: "tracken" | "user" | "system";
    actorUserId?: string | null;
    note?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO tracken_ticket_events (
       ticket_id, event_type, from_status, to_status,
       actor_type, actor_user_id, note, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      entry.ticketId,
      entry.eventType,
      entry.fromStatus ?? null,
      entry.toStatus ?? null,
      entry.actorType,
      entry.actorUserId ?? null,
      entry.note ?? null,
      JSON.stringify(entry.metadata ?? {}),
    ]
  );
}

type BatchOutcome = {
  received: number;
  created: number;
  duplicated: number;
  rejected: number;
  results: TrackenItemResult[];
};

/**
 * Grava um lote de atendimentos.
 *
 * Cada item roda em um SAVEPOINT proprio: um envio invalido nao derruba os
 * demais do lote, e a operacao inteira usa um unico client dedicado.
 *
 * Idempotencia: `shipment_id` repetido nao cria duplicado nem devolve erro,
 * apenas informa o registro existente. Isso torna o retry da Tracken seguro.
 */
export async function createTicketsBatch(
  items: Array<{ normalized: NormalizedItem; rawPayload: unknown }>,
  context: { credentialId: string | null }
): Promise<BatchOutcome> {
  const statuses = await getStatusMap();
  const initialStatus =
    statuses.find((status) => status.is_initial)?.code ?? "recepcionado";

  const carriers = await getCarriers();
  const carrierByCode = new Map(
    carriers.map((carrier) => [carrier.code.toUpperCase(), carrier])
  );

  const results: TrackenItemResult[] = [];
  let created = 0;
  let duplicated = 0;
  let rejected = 0;

  await withTransaction(async (client) => {
    for (let index = 0; index < items.length; index += 1) {
      const { normalized, rawPayload } = items[index];
      const savepoint = `sp_${index}`;

      const carrier = carrierByCode.get(normalized.carrierCode);
      if (!carrier) {
        rejected += 1;
        results.push({
          shipment_id: normalized.shipmentId,
          status: "rejected",
          code: "UNKNOWN_CARRIER",
          message: `Transportadora "${normalized.carrierCode}" nao cadastrada`,
        });
        continue;
      }

      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        const inserted = await client.query<{ id: string; status: string }>(
          `INSERT INTO tracken_tickets (
             shipment_id, order_id, carrier_id, tracken_ref,
             buyer_nickname, buyer_name, seller_name, seller_ml_id,
             sale_date, shipping_deadline, status, service_type,
             tracking_number, pack_id, delay_reason, requested_by,
             payload_raw, credential_id
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17::jsonb, $18
           )
           ON CONFLICT (shipment_id) DO NOTHING
           RETURNING id, status`,
          [
            normalized.shipmentId,
            normalized.orderId,
            carrier.id,
            normalized.trackenRef,
            normalized.buyerNickname,
            normalized.buyerName,
            normalized.sellerName,
            normalized.sellerMlId,
            normalized.saleDate.toISOString(),
            normalized.shippingDeadline
              ? normalized.shippingDeadline.toISOString()
              : null,
            initialStatus,
            normalized.serviceType,
            normalized.trackingNumber,
            normalized.packId,
            normalized.delayReason,
            normalized.requestedBy,
            JSON.stringify(rawPayload ?? {}),
            context.credentialId,
          ]
        );

        if (inserted.rowCount === 0) {
          const existing = await client.query<{ id: string; status: string }>(
            `SELECT id, status FROM tracken_tickets WHERE shipment_id = $1`,
            [normalized.shipmentId]
          );
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);

          duplicated += 1;
          results.push({
            shipment_id: normalized.shipmentId,
            status: "duplicated",
            ticket_id: existing.rows[0]?.id,
            ticket_status: existing.rows[0]?.status,
            message: "Envio ja recebido anteriormente",
          });
          continue;
        }

        const ticket = inserted.rows[0];

        await recordEvent(client, {
          ticketId: ticket.id,
          eventType: "received",
          toStatus: ticket.status,
          actorType: "tracken",
          note: normalized.requestedBy
            ? `Solicitado por ${normalized.requestedBy}`
            : null,
          metadata: {
            carrier_code: carrier.code,
            service_type: normalized.serviceType,
          },
        });

        await enqueueOutboxEvent(client, ticket.id, "ticket.received", {
          shipment_id: normalized.shipmentId,
          order_id: normalized.orderId,
          status: ticket.status,
        });

        await client.query(`RELEASE SAVEPOINT ${savepoint}`);

        created += 1;
        results.push({
          shipment_id: normalized.shipmentId,
          status: "created",
          ticket_id: ticket.id,
          ticket_status: ticket.status,
        });
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);

        console.error(
          `[TRACKEN] Falha ao gravar envio ${normalized.shipmentId}:`,
          error
        );
        rejected += 1;
        results.push({
          shipment_id: normalized.shipmentId,
          status: "rejected",
          code: "PERSISTENCE_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Falha ao gravar o atendimento",
        });
      }
    }
  });

  return {
    received: items.length,
    created,
    duplicated,
    rejected,
    results,
  };
}

export type StatusChangeInput = {
  ticketId: string;
  toStatus: string;
  actorUserId: string;
  actorIsAdmin: boolean;
  note?: string | null;
  mlClaimId?: string | null;
  assignToActor?: boolean;
};

/**
 * Muda o status de um atendimento.
 *
 * Na mesma transacao: atualiza o ticket, grava o historico e enfileira a
 * notificacao. A tela responde na hora e o envio para a Tracken acontece
 * depois, pelo worker do outbox.
 */
export async function changeTicketStatus(input: StatusChangeInput) {
  const statuses = await getStatusMap();
  const target = statuses.find((status) => status.code === input.toStatus);
  if (!target) {
    throw unprocessable(
      "INVALID_STATUS",
      `Status "${input.toStatus}" nao existe no mapa de status`
    );
  }

  return withTransaction(async (client) => {
    const current = await client.query<{
      id: string;
      shipment_id: string;
      order_id: string;
      status: string;
      assigned_user_id: string | null;
    }>(
      `SELECT id, shipment_id, order_id, status, assigned_user_id
         FROM tracken_tickets
        WHERE id = $1
        FOR UPDATE`,
      [input.ticketId]
    );

    const ticket = current.rows[0];
    if (!ticket) {
      throw notFound();
    }

    if (ticket.status === input.toStatus) {
      throw unprocessable(
        "STATUS_UNCHANGED",
        `Atendimento ja esta em "${target.label}"`
      );
    }

    const origin = statuses.find((status) => status.code === ticket.status);
    const transitionAllowed =
      origin?.allowed_next.includes(input.toStatus) ?? false;

    if (!transitionAllowed) {
      throw unprocessable(
        "TRANSITION_NOT_ALLOWED",
        `Transicao de "${origin?.label ?? ticket.status}" para "${target.label}" nao e permitida`
      );
    }

    // Reabrir um atendimento finalizado e privilegio administrativo.
    if (origin?.is_final && !input.actorIsAdmin) {
      throw new TrackenApiError(
        403,
        "REOPEN_REQUIRES_ADMIN",
        "Reabrir um atendimento finalizado exige permissao administrativa"
      );
    }

    const shouldAssign =
      input.assignToActor !== false && !ticket.assigned_user_id;

    const updated = await client.query<{
      id: string;
      status: string;
      started_at: string | null;
      finished_at: string | null;
      assigned_user_id: string | null;
    }>(
      `UPDATE tracken_tickets
          SET status = $2,
              assigned_user_id = CASE WHEN $3 THEN $4 ELSE assigned_user_id END,
              started_at = CASE
                WHEN started_at IS NULL AND $5 = false THEN CURRENT_TIMESTAMP
                ELSE started_at
              END,
              finished_at = CASE
                WHEN $6 THEN CURRENT_TIMESTAMP
                ELSE NULL
              END,
              resolution_note = COALESCE($7, resolution_note),
              ml_claim_id = COALESCE($8, ml_claim_id)
        WHERE id = $1
        RETURNING id, status, started_at, finished_at, assigned_user_id`,
      [
        input.ticketId,
        input.toStatus,
        shouldAssign,
        input.actorUserId,
        target.is_initial,
        target.is_final,
        input.note ?? null,
        input.mlClaimId ?? null,
      ]
    );

    await recordEvent(client, {
      ticketId: input.ticketId,
      eventType: "status_changed",
      fromStatus: ticket.status,
      toStatus: input.toStatus,
      actorType: "user",
      actorUserId: input.actorUserId,
      note: input.note ?? null,
      metadata: input.mlClaimId ? { ml_claim_id: input.mlClaimId } : {},
    });

    await enqueueOutboxEvent(client, input.ticketId, "ticket.status_changed", {
      shipment_id: ticket.shipment_id,
      order_id: ticket.order_id,
      from_status: ticket.status,
      to_status: input.toStatus,
      status_label: target.label,
      ml_claim_id: input.mlClaimId ?? null,
      note: input.note ?? null,
    });

    return updated.rows[0];
  });
}

/** Atribui (ou libera) o atendimento para um atendente. */
export async function assignTicket(
  ticketId: string,
  actorUserId: string,
  targetUserId: string | null
) {
  return withTransaction(async (client) => {
    const current = await client.query<{ assigned_user_id: string | null }>(
      `SELECT assigned_user_id FROM tracken_tickets WHERE id = $1 FOR UPDATE`,
      [ticketId]
    );

    if (current.rowCount === 0) {
      throw notFound();
    }

    const updated = await client.query<{
      id: string;
      assigned_user_id: string | null;
    }>(
      `UPDATE tracken_tickets
          SET assigned_user_id = $2
        WHERE id = $1
        RETURNING id, assigned_user_id`,
      [ticketId, targetUserId]
    );

    await recordEvent(client, {
      ticketId,
      eventType: targetUserId ? "assigned" : "unassigned",
      actorType: "user",
      actorUserId: actorUserId,
      metadata: { target_user_id: targetUserId },
    });

    return updated.rows[0];
  });
}
