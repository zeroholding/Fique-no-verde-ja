import crypto from "crypto";
import type { PoolClient } from "pg";
import { trackenQuery, withTransaction } from "./db";
import {
  STATUS_REQUIRING_DENIAL_REASON,
  denialReasonLabel,
  isDenialReasonCode,
} from "./denial";
import { TrackenApiError, notFound, unprocessable } from "./errors";
import type {
  TrackenCarrierRow,
  TrackenItemResult,
  TrackenStatusRow,
} from "./types";
import type { NormalizedItem } from "./validation";
import { normalizeName } from "@/lib/name-search";

/** Regra de negocio do atendimento Tracken. */

/**
 * Mapa de status.
 *
 * @param includeInactive inclui status desativados. Necessario ao VALIDAR uma
 *   transicao: se o status atual do atendimento saiu do mapa, sem ele a origem
 *   fica desconhecida e o atendimento trava para sempre, com mensagem
 *   enganosa. Para montar filtro e catalogo, so os ativos interessam.
 */
export async function getStatusMap(
  includeInactive = false
): Promise<TrackenStatusRow[]> {
  const result = await trackenQuery<TrackenStatusRow>(
    `SELECT code, label, tracken_status, color, sort_order,
            is_initial, is_final, counts_as_sla, allowed_next, is_active
       FROM tracken_status_map
      ${includeInactive ? "" : "WHERE is_active = true"}
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

/**
 * Grava uma linha do historico do atendimento.
 *
 * Exportada porque o worker do outbox (`lib/tracken/webhook.ts`) tambem escreve
 * aqui, para registrar `webhook_sent` e `webhook_failed`. Toda escrita no
 * historico passa por esta funcao: a tabela tem trigger que proibe UPDATE, e
 * concentrar o INSERT em um lugar so evita que um caminho novo grave um
 * `event_type` ou `actor_type` fora do CHECK e descubra isso em producao.
 */
export async function recordEvent(
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
 * Codigo interno a partir do nome informado pela TRACKen.
 *
 * `tracken_carriers.code` e VARCHAR(40) UNIQUE e serve de identificador estavel
 * para quem integra. "FLEX BOYS" vira "FLEX_BOYS": sem acento, caixa alta, e
 * qualquer corrida de caracteres fora de A-Z0-9 colapsada em um separador so.
 *
 * O fallback para hash existe porque nome escrito inteiro em caracteres nao
 * latinos sairia vazio daqui, e codigo vazio viola o NOT NULL do banco no
 * caminho que existe justamente para NAO recusar o acionamento.
 */
function derivarCodigoTransportadora(nome: string): string {
  const base = normalizeName(nome)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    // O slice pode cortar no meio do separador e deixar "_" no fim.
    .replace(/_+$/g, "");

  if (base) return base;

  return `TRANSP_${crypto
    .createHash("sha256")
    .update(nome, "utf8")
    .digest("hex")
    .slice(0, 12)
    .toUpperCase()}`;
}

/**
 * Cadastra uma transportadora vista pela primeira vez.
 *
 * Roda no savepoint do item, entao falhar aqui recusa um acionamento e nao o
 * lote. Nasce ativa, porque uma transportadora inativa nao aparece em
 * `getCarriers()` e o proximo acionamento tentaria criar de novo; e nasce com a
 * cor `slate`, a neutra do painel, que na pratica marca quem entrou por este
 * caminho e ainda nao passou por revisao na tela de Transportadoras.
 *
 * `ON CONFLICT (code) DO NOTHING` seguido de SELECT cobre dois casos com o
 * mesmo codigo: dois lotes simultaneos trazendo a mesma transportadora nova, e
 * um nome diferente que deriva para um codigo ja existente. Nos dois o certo e
 * usar a linha que esta no banco, nao criar uma segunda.
 */
async function criarTransportadora(
  client: PoolClient,
  identificador: { code: string | null; name: string | null }
): Promise<TrackenCarrierRow> {
  // Quando so o codigo veio, ele serve tambem de nome: e o unico rotulo que
  // temos, e deixar o nome vazio quebraria toda tela que exibe transportadora.
  const nome = (identificador.name ?? identificador.code ?? "").trim();
  const codigo = identificador.code
    ? identificador.code.toUpperCase().slice(0, 40)
    : derivarCodigoTransportadora(nome);

  const inserida = await client.query<TrackenCarrierRow>(
    `INSERT INTO tracken_carriers (code, name, color, is_active)
     VALUES ($1, $2, 'slate', true)
     ON CONFLICT (code) DO NOTHING
     RETURNING id, code, name, color, is_active`,
    [codigo, nome.slice(0, 200)]
  );

  if (inserida.rows[0]) {
    return inserida.rows[0];
  }

  const existente = await client.query<TrackenCarrierRow>(
    `SELECT id, code, name, color, is_active
       FROM tracken_carriers
      WHERE code = $1`,
    [codigo]
  );

  if (!existente.rows[0]) {
    // Sem linha inserida e sem linha existente o proximo passo gravaria
    // carrier_id nulo sem ninguem perceber.
    throw new Error(
      `Nao foi possivel cadastrar nem localizar a transportadora "${nome}" (codigo ${codigo})`
    );
  }

  return existente.rows[0];
}

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

  /**
   * Transportadora resolvida por CODIGO ou por NOME.
   *
   * O contrato com a TRACKen pede "nome da transportadora". Casar apenas o
   * codigo em igualdade exata rejeitaria o lote inteiro no primeiro envio
   * real, porque o nome cadastrado aqui e "TM Transportes" e o codigo e "TM".
   *
   * O nome e comparado sem acento e sem caixa, e tambem pelo primeiro termo,
   * para "Transmoto Logistica" achar "Transmoto". Codigo tem precedencia: e
   * identificador, nome e descricao.
   *
   * Nao achou: a transportadora e CRIADA (ver `criarTransportadora`). Antes o
   * item era recusado com UNKNOWN_CARRIER, e o efeito pratico era a TRACKen
   * nao conseguir abrir atendimento para um cliente novo dela ate alguem aqui
   * cadastrar a transportadora na mao -- sendo que nao existe tela para isso,
   * so UPDATE em `tracken_carriers`. O acionamento e o dado que nao pode ser
   * perdido; o cadastro se arruma depois.
   */
  const carriers = await getCarriers();
  const carrierByCode = new Map(
    carriers.map((carrier) => [carrier.code.toUpperCase(), carrier])
  );
  const carrierByName = new Map(
    carriers.map((carrier) => [normalizeName(carrier.name), carrier])
  );
  const carrierByFirstWord = new Map(
    carriers.map((carrier) => [
      normalizeName(carrier.name).split(/\s+/)[0],
      carrier,
    ])
  );

  const resolveCarrier = (item: NormalizedItem) => {
    if (item.carrierCode) {
      const byCode = carrierByCode.get(item.carrierCode);
      if (byCode) return byCode;
    }

    if (item.carrierName) {
      const normalized = normalizeName(item.carrierName);
      // Nome pode coincidir com um codigo ("TM" mandado em carrier_name).
      const asCode = carrierByCode.get(item.carrierName.toUpperCase());
      return (
        carrierByName.get(normalized) ??
        asCode ??
        carrierByFirstWord.get(normalized.split(/\s+/)[0])
      );
    }

    return undefined;
  };

  /**
   * Registra nos indices uma transportadora criada durante o lote.
   *
   * Chamado apenas DEPOIS do RELEASE do savepoint. Registrar antes deixaria os
   * mapas apontando para uma linha que o ROLLBACK TO SAVEPOINT desfez, e os
   * itens seguintes do mesmo lote gravariam `carrier_id` de transportadora
   * inexistente.
   */
  const indexarTransportadora = (carrier: TrackenCarrierRow) => {
    carrierByCode.set(carrier.code.toUpperCase(), carrier);
    const normalizado = normalizeName(carrier.name);
    carrierByName.set(normalizado, carrier);
    const primeiroTermo = normalizado.split(/\s+/)[0];
    if (!carrierByFirstWord.has(primeiroTermo)) {
      carrierByFirstWord.set(primeiroTermo, carrier);
    }
  };

  const results: TrackenItemResult[] = [];
  let created = 0;
  let duplicated = 0;
  let rejected = 0;

  await withTransaction(async (client) => {
    for (let index = 0; index < items.length; index += 1) {
      const { normalized, rawPayload } = items[index];
      const savepoint = `sp_${index}`;

      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        // O cadastro da transportadora nova acontece DENTRO do savepoint do
        // item: se ele falhar, recusa este acionamento e nao o lote inteiro.
        const conhecida = resolveCarrier(normalized);
        const carrier =
          conhecida ??
          (await criarTransportadora(client, {
            code: normalized.carrierCode,
            name: normalized.carrierName,
          }));
        const carrierCriada = conhecida === undefined;

        const inserted = await client.query<{ id: string; status: string }>(
          `INSERT INTO tracken_tickets (
             shipment_id, order_id, carrier_id, tracken_ref,
             buyer_nickname, buyer_name, seller_name, seller_ml_id,
             sale_date, shipping_deadline, shipped_at, shipping_mode,
             status, service_type,
             tracking_number, pack_id, delay_reason, requested_by,
             payload_raw, credential_id
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17, $18, $19::jsonb, $20
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
            normalized.shippedAt ? normalized.shippedAt.toISOString() : null,
            normalized.shippingMode,
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
          if (carrierCriada) {
            indexarTransportadora(carrier);
          }

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
            // Fica no historico imutavel do atendimento: e a unica forma de,
            // meses depois, saber que aquela transportadora entrou pelo
            // acionamento e nao por cadastro revisado.
            ...(carrierCriada
              ? { carrier_auto_created: true, carrier_name: carrier.name }
              : {}),
          },
        });

        // Mesmo formato do `ticket.status_changed`: quem consome o webhook le os
        // dois eventos com um codigo so. Divergir aqui obrigaria o outro lado a
        // dois parsers para dizer a mesma coisa.
        await enqueueOutboxEvent(client, ticket.id, "ticket.received", {
          shipment_id: normalized.shipmentId,
          order_id: normalized.orderId,
          tracken_ref: normalized.trackenRef,
          status: ticket.status,
          tracken_status:
            statuses.find((status) => status.code === ticket.status)
              ?.tracken_status ?? null,
        });

        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        if (carrierCriada) {
          indexarTransportadora(carrier);
        }

        created += 1;
        results.push({
          shipment_id: normalized.shipmentId,
          status: "created",
          ticket_id: ticket.id,
          ticket_status: ticket.status,
          // Dito de volta de proposito: assim a TRACKen ve no retorno que o
          // nome caiu num cadastro novo, e um erro de digitacao aparece para
          // eles no mesmo instante em vez de virar transportadora fantasma.
          ...(carrierCriada
            ? {
                message: `Transportadora "${carrier.name}" cadastrada automaticamente com o codigo ${carrier.code}`,
              }
            : {}),
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
  /** Obrigatorio quando `toStatus` e "negado". Um dos codigos de DENIAL_REASONS. */
  denialReason?: string | null;
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
  // Inclui desativados para reconhecer a origem de um atendimento cujo status
  // saiu do mapa. O destino, porem, precisa estar ativo.
  const statuses = await getStatusMap(true);
  const target = statuses.find((status) => status.code === input.toStatus);
  if (!target) {
    throw unprocessable(
      "INVALID_STATUS",
      `Status "${input.toStatus}" nao existe no mapa de status`
    );
  }
  if (target.is_active === false) {
    throw unprocessable(
      "INACTIVE_STATUS",
      `Status "${target.label}" esta desativado e nao pode ser aplicado`
    );
  }

  /**
   * Motivo da negativa.
   *
   * A validacao mora aqui, e nao na rota, porque este e o unico caminho de
   * escrita de status: as duas telas que negam (menu da linha e modal de
   * detalhe) passam por aqui, e qualquer chamada futura tambem. Validar na
   * rota deixaria a porta aberta para um caminho novo gravar negativa sem
   * motivo, que e justamente o dado que a operacao passou a exigir.
   *
   * A checagem e feita ANTES de abrir a transacao: recusa barata, sem lock.
   */
  const requiresReason = input.toStatus === STATUS_REQUIRING_DENIAL_REASON;
  const reason = input.denialReason?.trim() || null;

  if (requiresReason && !reason) {
    throw unprocessable(
      "MISSING_DENIAL_REASON",
      "Negar um atendimento exige informar o motivo"
    );
  }
  if (reason && !isDenialReasonCode(reason)) {
    throw unprocessable(
      "INVALID_DENIAL_REASON",
      `Motivo de negativa "${reason}" nao existe`
    );
  }
  // Motivo em transicao que nao e negativa seria dado enganoso: apareceria na
  // ficha de um atendimento removido como se ele tivesse sido negado.
  if (reason && !requiresReason) {
    throw unprocessable(
      "DENIAL_REASON_NOT_APPLICABLE",
      `Motivo de negativa so se aplica ao status "${STATUS_REQUIRING_DENIAL_REASON}"`
    );
  }

  return withTransaction(async (client) => {
    // `tracken_ref` entra aqui so para viajar de volta na notificacao: e o
    // numero do atendimento no sistema DELES. Devolvendo essa referencia, a
    // Tracken casa o webhook com o registro proprio sem precisar manter um
    // indice por shipment_id.
    const current = await client.query<{
      id: string;
      shipment_id: string;
      order_id: string;
      tracken_ref: string | null;
      status: string;
      assigned_user_id: string | null;
    }>(
      `SELECT id, shipment_id, order_id, tracken_ref, status, assigned_user_id
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
              ml_claim_id = COALESCE($8, ml_claim_id),
              -- Atribuicao direta, sem COALESCE: sair de "negado" para
              -- qualquer outro status precisa LIMPAR o motivo, senao um
              -- atendimento reaberto e depois removido continuaria carregando
              -- a justificativa de uma negativa que nao vale mais.
              denial_reason = $9
        WHERE id = $1
        RETURNING id, status, started_at, finished_at, assigned_user_id,
                  denial_reason`,
      [
        input.ticketId,
        input.toStatus,
        shouldAssign,
        input.actorUserId,
        target.is_initial,
        target.is_final,
        input.note ?? null,
        input.mlClaimId ?? null,
        reason,
      ]
    );

    // O motivo entra no historico e na notificacao. Sem isso, reabrir um
    // atendimento negado apagaria o motivo da coluna e nao sobraria registro
    // nenhum de por que ele havia sido negado.
    await recordEvent(client, {
      ticketId: input.ticketId,
      eventType: "status_changed",
      fromStatus: ticket.status,
      toStatus: input.toStatus,
      actorType: "user",
      actorUserId: input.actorUserId,
      note: input.note ?? null,
      metadata: {
        ...(input.mlClaimId ? { ml_claim_id: input.mlClaimId } : {}),
        ...(reason
          ? {
              denial_reason: reason,
              denial_reason_label: denialReasonLabel(reason),
            }
          : {}),
      },
    });

    // Quem mudou. A Tracken abre o atendimento no painel dela a partir do que
    // recebe; sem isso o historico do lado deles mostra a mudanca sem autor e
    // qualquer duvida vira ligacao para descobrir com quem falar. Vai o nome do
    // atendente, nao e-mail nem id interno.
    const actor = await client.query<{
      first_name: string | null;
      last_name: string | null;
    }>(`SELECT first_name, last_name FROM users WHERE id = $1`, [
      input.actorUserId,
    ]);

    const changedBy =
      [actor.rows[0]?.first_name, actor.rows[0]?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || null;

    await enqueueOutboxEvent(client, input.ticketId, "ticket.status_changed", {
      shipment_id: ticket.shipment_id,
      order_id: ticket.order_id,
      tracken_ref: ticket.tracken_ref,
      from_status: ticket.status,
      to_status: input.toStatus,
      status_label: target.label,
      // `tracken_status` e o vocabulario DELES (received, in_progress,
      // removed, denied, cancelled). Mandar so o codigo interno obrigaria o
      // outro lado a manter uma copia do nosso mapa e a adivinhar o significado
      // de um status novo.
      tracken_status: target.tracken_status,
      // Encerramento nao ganha evento proprio. Um `ticket.finished` separado
      // descreveria o MESMO fato que este evento ja descreve, e a Tracken
      // teria de tratar dois recebimentos para uma mudanca — com risco de
      // aplicar um e perder o outro. Aqui o encerramento e um atributo da
      // transicao.
      is_final: target.is_final,
      finished_at: updated.rows[0]?.finished_at ?? null,
      changed_by: changedBy,
      ml_claim_id: input.mlClaimId ?? null,
      note: input.note ?? null,
      denial_reason: reason,
      denial_reason_label: denialReasonLabel(reason),
    });

    return updated.rows[0];
  });
}

/**
 * Atribui (ou libera) o atendimento para um atendente.
 *
 * NAO enfileira notificacao, e isso e decisao, nao esquecimento: atribuicao e
 * organizacao interna da equipe e muda varias vezes sem que o status do
 * atendimento se altere. Enviar para fora encheria a fila de eventos que a
 * Tracken descartaria, e ainda expondo nome de atendente sem que isso mude nada
 * do lado deles. O autor da mudanca ja viaja em `changed_by` quando o status
 * muda de verdade, que e o que a Tracken pediu para acompanhar.
 */
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
