import { buildSignature, decryptSecret } from "./crypto";
import { logTrackenRequest, trackenQuery, withTransaction } from "./db";
import { recordEvent } from "./tickets";

/**
 * Worker de saida da integracao Tracken.
 *
 * O caminho de escrita (criar atendimento, mudar status) apenas ENFILEIRA em
 * `tracken_outbox` e responde. Quem entrega e este modulo, chamado por
 * `POST /api/tracken/outbox/dispatch`. A separacao existe por dois motivos:
 *
 *   1. A tela do atendente nao pode esperar o servidor da Tracken. Se o destino
 *      estiver fora do ar, mudar status continua instantaneo.
 *   2. Entrega precisa de retry, e retry precisa de estado duravel. HTTP dentro
 *      da transacao do ticket nao tem onde anotar "tentar de novo em 4 minutos".
 *
 * Assinatura: o mesmo esquema que a Tracken ja usa para ENTRAR aqui
 * (`X-FNVJ-Timestamp` + `X-FNVJ-Signature` sobre `<timestamp>.<corpo>`), so na
 * direcao contraria. Assim o dev do outro lado reaproveita o codigo que ja tem.
 */

/** Itens reivindicados por execucao. */
const BATCH_SIZE = 10;

/** Teto por requisicao HTTP. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Orcamento da execucao inteira.
 *
 * A rota declara `maxDuration = 60`. Se o loop for ate o fim com dez destinos
 * lentos (10 x 10s) a plataforma corta a execucao no meio, e o item que estava
 * em voo fica sem conclusao registrada. Parando por conta propria antes disso, o
 * que sobrou volta para a fila de forma limpa.
 */
const RUN_BUDGET_MS = 45_000;

/**
 * Tempo que um item fica reservado depois de reivindicado.
 *
 * Enquanto o POST acontece o item nao esta mais protegido por lock de
 * transacao: a transacao do claim ja commitou (ver `claimBatch`). O que impede
 * outra execucao de pegar o mesmo item e este empurrao no `next_attempt_at`.
 * Se o processo morrer no meio do envio, o item volta a ser elegivel sozinho
 * depois desse prazo, sem intervencao manual.
 */
const LEASE_MINUTES = 2;

/** Primeiro degrau do backoff, em segundos. Dobra a cada tentativa. */
const BACKOFF_BASE_SECONDS = 30;

/** Teto do backoff, para a espera nao virar dias. */
const BACKOFF_MAX_SECONDS = 6 * 60 * 60;

/** Corte do corpo da resposta guardado em log. */
const MAX_LOGGED_RESPONSE = 2000;

type OutboxRow = {
  id: string;
  ticket_id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  shipment_id: string | null;
};

type WebhookTarget = {
  credentialId: string;
  url: string;
  /**
   * Destino sem query string, para gravar no log.
   *
   * Ha servico que autentica webhook por token na propria URL. Guardar a URL
   * inteira em `tracken_request_log` deixaria esse token em texto puro numa
   * tabela que a tela de Configuracoes exibe.
   */
  logLabel: string;
  secret: string | null;
};

export type DispatchOutcome = {
  /** Itens reivindicados nesta execucao. */
  claimed: number;
  /** Entregues com 2xx. */
  sent: number;
  /** Falharam e voltaram para a fila com nova data de tentativa. */
  retried: number;
  /** Desistencia definitiva: erro permanente ou tentativas esgotadas. */
  dead: number;
  /** Devolvidos sem tentar: orcamento de tempo ou ordem do ticket. */
  released: number;
  /** Quantos continuam aguardando depois desta execucao. */
  pending: number;
  /** Preenchido quando nao ha destino utilizavel configurado. */
  skippedReason?: string;
  /** false quando a credencial nao tem `webhook_secret` gravado. */
  signed: boolean;
};

/**
 * Le o segredo de assinatura da credencial.
 *
 * A coluna e `VARCHAR(255)` e foi criada para texto puro, diferente de
 * `secret_encrypted`. Aceitar os dois formatos permite passar a gravar cifrado
 * (o formato `v1.<iv>.<tag>.<dados>` cabe folgado em 255 caracteres) sem
 * migration e sem quebrar o que ja estiver gravado em claro.
 */
function readWebhookSecret(stored: string | null): string | null {
  const raw = stored?.trim();
  if (!raw) return null;
  if (!raw.startsWith("v1.")) return raw;

  try {
    return decryptSecret(raw);
  } catch (error) {
    console.error(
      "[TRACKEN] webhook_secret parece cifrado mas nao pode ser decifrado:",
      error
    );
    // Fail-closed: secret configurado mas ilegivel e configuracao quebrada, nao
    // autorizacao para enviar sem assinatura. O destino sera recusado antes do
    // claim, preservando todos os eventos pendentes para a proxima execucao.
    throw new Error("WEBHOOK_SECRET_DECRYPT_FAILED");
  }
}

/**
 * Descobre para onde enviar.
 *
 * `tracken_outbox` nao guarda credencial: o evento e do atendimento, nao de
 * quem vai receber. O destino e a credencial ativa que tenha `webhook_url` — na
 * pratica existe uma, a da Tracken.
 *
 * DOIS DESTINOS PARAM A FILA, de proposito. A versao anterior pegava a
 * credencial de `updated_at` mais recente, e isso escondia um acidente caro: o
 * ambiente nao entra na escolha, e a Tracken entregou primeiro a URL de
 * homologacao (`homologasellercore...`). Com a credencial de producao e uma de
 * sandbox configuradas ao mesmo tempo, qual das duas recebia o evento real
 * passava a depender de quem foi salva por ultimo — e o dado de comprador e
 * vendedor de um atendimento de verdade sairia para o servidor de teste deles,
 * sem nada na tela indicando isso.
 *
 * Fila parada aparece na tela de Configuracoes e no retorno do dispatch. Evento
 * entregue no lugar errado nao aparece em parte nenhuma.
 */
async function resolveTarget(): Promise<
  { target: WebhookTarget } | { reason: string }
> {
  const result = await trackenQuery<{
    id: string;
    name: string;
    environment: string;
    webhook_url: string;
    webhook_secret: string | null;
    require_signature: boolean;
  }>(
    `SELECT id, name, environment, webhook_url, webhook_secret,
            require_signature
       FROM tracken_api_credentials
      WHERE is_active = true
        AND webhook_url IS NOT NULL
        AND btrim(webhook_url) <> ''
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ORDER BY updated_at DESC`
  );

  if (result.rows.length === 0) {
    return {
      reason:
        "Nenhuma credencial ativa tem webhook_url configurada. Grave o destino com: node scripts/tracken_credential.mjs webhook <api_key> <url> [secret]",
    };
  }

  if (result.rows.length > 1) {
    const candidatas = result.rows
      .map((row) => `${row.name} (${row.environment})`)
      .join(", ");

    return {
      reason:
        `Ha ${result.rows.length} credenciais ativas com webhook_url: ${candidatas}. ` +
        "O destino ficaria indefinido, entao nada foi entregue. Deixe apenas uma: " +
        "node scripts/tracken_credential.mjs webhook <api_key> --clear",
    };
  }

  const row = result.rows[0];

  let parsed: URL;
  try {
    parsed = new URL(row.webhook_url.trim());
  } catch {
    return { reason: `webhook_url invalida: ${row.webhook_url}` };
  }

  // O corpo leva dado de comprador e vendedor, e o header leva assinatura.
  // Em claro na rede os dois vazam, e a assinatura interceptada pode ser
  // reaproveitada dentro da janela de validade. Localhost fica liberado para
  // teste local, onde nao ha rede no meio.
  const isLocal =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "::1";

  if (parsed.protocol !== "https:" && !isLocal) {
    return {
      reason: `webhook_url precisa usar https (recebido ${parsed.protocol}//)`,
    };
  }

  let secret: string | null;
  try {
    secret = readWebhookSecret(row.webhook_secret);
  } catch {
    return {
      reason:
        "webhook_secret esta configurado, mas nao pode ser decifrado. Corrija TRACKEN_ENCRYPTION_KEY ou grave novamente o secret antes de entregar eventos.",
    };
  }

  if (row.require_signature && !secret) {
    return {
      reason:
        "A credencial exige assinatura, mas webhook_secret esta ausente. Grave o secret antes de entregar eventos.",
    };
  }

  return {
    target: {
      credentialId: row.id,
      url: parsed.toString(),
      logLabel: `${parsed.origin}${parsed.pathname}`,
      secret,
    },
  };
}

/**
 * Reivindica um lote para esta execucao.
 *
 * `FOR UPDATE SKIP LOCKED` e a peca central: duas execucoes sobrepostas (cron
 * atrasado somado a um disparo manual) nao pegam o mesmo item — a segunda pula
 * o que a primeira travou em vez de entregar em dobro.
 *
 * Alem do lock, o `NOT EXISTS` abaixo implementa FIFO GLOBAL POR TICKET: uma
 * candidata so pode ser reclamada se nao existir predecessor `pending/failed`
 * do mesmo atendimento. O predecessor bloqueia mesmo com `next_attempt_at` no
 * futuro, pois esse futuro pode ser tanto backoff quanto lease de outro
 * dispatch ainda em voo. Assim dispatches concorrentes nunca ultrapassam o
 * evento nao terminal mais antigo de um ticket.
 *
 * `attempts` sobe aqui, no claim, e nao depois da resposta. Se subisse depois,
 * um evento que derruba o processo no meio do envio seria reivindicado para
 * sempre, sem nunca chegar ao limite de tentativas: um loop infinito silencioso
 * a cada rodada do cron. Contando na reivindicacao, esse caso caminha para
 * `dead` como qualquer outra falha.
 */
async function claimBatch(limit: number): Promise<OutboxRow[]> {
  const result = await trackenQuery<OutboxRow>(
    `WITH elegiveis AS (
       SELECT candidata.id
         FROM tracken_outbox candidata
        WHERE candidata.status IN ('pending', 'failed')
          AND candidata.next_attempt_at <= CURRENT_TIMESTAMP
          AND NOT EXISTS (
            SELECT 1
              FROM tracken_outbox predecessora
             WHERE predecessora.ticket_id = candidata.ticket_id
               AND predecessora.status IN ('pending', 'failed')
               AND (predecessora.created_at, predecessora.id) <
                   (candidata.created_at, candidata.id)
          )
        ORDER BY candidata.created_at, candidata.id
        LIMIT $1
        FOR UPDATE OF candidata SKIP LOCKED
     )
     UPDATE tracken_outbox o
        SET attempts = o.attempts + 1,
            next_attempt_at = CURRENT_TIMESTAMP + ($2 || ' minutes')::interval
       FROM elegiveis e
      WHERE o.id = e.id
      RETURNING o.id, o.ticket_id, o.event_type, o.payload,
                o.attempts, o.max_attempts, o.created_at,
                (SELECT t.shipment_id
                   FROM tracken_tickets t
                  WHERE t.id = o.ticket_id) AS shipment_id`,
    [limit, LEASE_MINUTES.toString()]
  );

  // O UPDATE ... FROM nao respeita o ORDER BY da CTE no RETURNING, entao a ordem
  // e refeita aqui. Ela importa: dois eventos do mesmo atendimento fora de
  // sequencia fazem a Tracken gravar status velho sobre status novo.
  //
  // `id` desempata porque `created_at` usa CURRENT_TIMESTAMP, que no Postgres e
  // o instante de inicio da TRANSACAO: um lote de atendimentos gravado de uma vez
  // sai com created_at identico em todas as linhas. Sao atendimentos distintos,
  // onde a ordem entre eles nao muda nada, mas sem desempate a sequencia varia
  // entre execucoes e um bug de ordem ficaria impossivel de reproduzir.
  return result.rows.sort((a, b) => {
    const diff =
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

/** Espera antes da proxima tentativa: 30s, 1m, 2m, 4m... limitado a 6h. */
function backoffSeconds(attempts: number): number {
  const expoente = Math.max(0, attempts - 1);
  const espera = BACKOFF_BASE_SECONDS * 2 ** expoente;
  return Math.min(espera, BACKOFF_MAX_SECONDS);
}

type SendResult = {
  ok: boolean;
  httpStatus: number | null;
  responseBody: string | null;
  error: string | null;
  /** false para erro que reenviar nao resolve (payload recusado, rota inexistente). */
  retryable: boolean;
};

function buildBody(row: OutboxRow): string {
  return JSON.stringify({
    event: row.event_type,
    // Identificador da ENTREGA, nao do evento de negocio. Serve para a Tracken
    // reconhecer reenvio e para casar com o log dos dois lados.
    delivery_id: row.id,
    // Quando o fato aconteceu aqui. Como o reenvio pode chegar depois de um
    // evento mais novo, e por este campo que o outro lado decide o que
    // descartar em vez de confiar na ordem de chegada.
    occurred_at: new Date(row.created_at).toISOString(),
    attempt: row.attempts,
    data: row.payload ?? {},
  });
}

async function send(target: WebhookTarget, row: OutboxRow, body: string): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "FNVJ-Webhook/1",
    "X-FNVJ-Event": row.event_type,
    "X-FNVJ-Delivery": row.id,
  };

  if (target.secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    headers["X-FNVJ-Timestamp"] = timestamp;
    headers["X-FNVJ-Signature"] = buildSignature(target.secret, timestamp, body);
  }

  try {
    const response = await fetch(target.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      // Redirect automatico descartaria o corpo assinado no salto e a
      // assinatura chegaria invalida no destino final, sem pista do motivo.
      redirect: "manual",
    });

    const text = await response.text().catch(() => "");
    const trimmed = text.slice(0, MAX_LOGGED_RESPONSE) || null;

    if (response.status >= 200 && response.status < 300) {
      return {
        ok: true,
        httpStatus: response.status,
        responseBody: trimmed,
        error: null,
        retryable: false,
      };
    }

    // 408 e 429 sao 4xx que pedem espera, nao correcao. 5xx e problema do
    // outro lado e costuma passar. O resto (400, 401, 404, 422) continuaria
    // dando o mesmo resultado nas oito tentativas.
    const retryable =
      response.status === 408 ||
      response.status === 429 ||
      response.status >= 500;

    return {
      ok: false,
      httpStatus: response.status,
      responseBody: trimmed,
      error: `HTTP ${response.status}`,
      retryable,
    };
  } catch (error) {
    const abortado = controller.signal.aborted;
    return {
      ok: false,
      httpStatus: null,
      responseBody: null,
      error: abortado
        ? `Timeout de ${REQUEST_TIMEOUT_MS}ms sem resposta`
        : error instanceof Error
          ? error.message
          : "Falha de rede",
      // Rede e timeout sao transitorios por definicao.
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Sucesso: fecha o item e registra `webhook_sent` no historico. */
async function finalizeSent(row: OutboxRow, result: SendResult): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE tracken_outbox
          SET status = 'sent',
              sent_at = CURRENT_TIMESTAMP,
              last_http_status = $2,
              last_error = NULL
        WHERE id = $1`,
      [row.id, result.httpStatus]
    );

    await recordEvent(client, {
      ticketId: row.ticket_id,
      eventType: "webhook_sent",
      actorType: "system",
      metadata: {
        event: row.event_type,
        delivery_id: row.id,
        http_status: result.httpStatus,
        attempts: row.attempts,
      },
    });
  });
}

/**
 * Falha: reagenda ou desiste.
 *
 * O evento `webhook_failed` no historico entra so na desistencia. Registrar
 * cada tentativa encheria a linha do tempo do atendimento com ruido de
 * infraestrutura — o atendente veria vinte linhas de erro para um envio que no
 * fim deu certo. Tentativa isolada fica em `last_error` e no log de
 * requisicoes, que e o lugar de quem esta investigando.
 */
async function finalizeFailure(
  row: OutboxRow,
  result: SendResult
): Promise<"retried" | "dead"> {
  const esgotou = row.attempts >= row.max_attempts;
  const desistir = esgotou || !result.retryable;

  if (!desistir) {
    await trackenQuery(
      `UPDATE tracken_outbox
          SET status = 'failed',
              next_attempt_at = CURRENT_TIMESTAMP + ($2 || ' seconds')::interval,
              last_http_status = $3,
              last_error = $4
        WHERE id = $1`,
      [
        row.id,
        backoffSeconds(row.attempts).toString(),
        result.httpStatus,
        result.error,
      ]
    );
    return "retried";
  }

  const motivo = esgotou
    ? `Tentativas esgotadas (${row.attempts}/${row.max_attempts}): ${result.error}`
    : `Erro permanente: ${result.error}`;

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE tracken_outbox
          SET status = 'dead',
              last_http_status = $2,
              last_error = $3
        WHERE id = $1`,
      [row.id, result.httpStatus, motivo]
    );

    await recordEvent(client, {
      ticketId: row.ticket_id,
      eventType: "webhook_failed",
      actorType: "system",
      note: motivo,
      metadata: {
        event: row.event_type,
        delivery_id: row.id,
        http_status: result.httpStatus,
        attempts: row.attempts,
        response: result.responseBody,
      },
    });
  });

  return "dead";
}

/**
 * Devolve o item para a fila sem gastar tentativa.
 *
 * Usado quando nem se tentou enviar: acabou o orcamento de tempo, ou um evento
 * anterior do MESMO atendimento falhou nesta rodada. Como `attempts` sobe no
 * claim, aqui ele volta.
 */
async function release(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await trackenQuery(
    `UPDATE tracken_outbox
        SET attempts = GREATEST(attempts - 1, 0),
            next_attempt_at = CURRENT_TIMESTAMP
      WHERE id = ANY($1::uuid[])`,
    [ids]
  );
}

async function countPending(): Promise<number> {
  const result = await trackenQuery<{ total: string }>(
    `SELECT COUNT(*)::text AS total
       FROM tracken_outbox
      WHERE status IN ('pending', 'failed')`
  );
  return Number(result.rows[0]?.total ?? 0);
}

/**
 * Entrega o que estiver pendente na fila.
 *
 * Envio em serie, de proposito. O claim ja garante FIFO global por ticket,
 * inclusive entre dispatches concorrentes e durante backoff/lease. A execucao
 * continua serial para manter carga previsivel no destino e uma ordem global
 * deterministica entre os eventos efetivamente reclamados.
 */
export async function dispatchOutbox(
  options: { batchSize?: number } = {}
): Promise<DispatchOutcome> {
  const limit = Math.max(1, Math.min(options.batchSize ?? BATCH_SIZE, 100));

  const resolved = await resolveTarget();
  if ("reason" in resolved) {
    // Sai antes de reivindicar. Falta de configuracao nossa nao pode consumir
    // as tentativas do evento nem empurrar `next_attempt_at` para frente.
    return {
      claimed: 0,
      sent: 0,
      retried: 0,
      dead: 0,
      released: 0,
      pending: await countPending(),
      skippedReason: resolved.reason,
      signed: false,
    };
  }

  const { target } = resolved;
  const rows = await claimBatch(limit);

  const outcome: DispatchOutcome = {
    claimed: rows.length,
    sent: 0,
    retried: 0,
    dead: 0,
    released: 0,
    pending: 0,
    signed: target.secret !== null,
  };

  if (!target.secret) {
    console.warn(
      "[TRACKEN] webhook_secret ausente: entregas sairao SEM assinatura HMAC"
    );
  }

  const prazo = Date.now() + RUN_BUDGET_MS;
  // Atendimento cujo evento falhou nesta rodada. Os proximos dele voltam para a
  // fila sem tentar, senao a Tracken receberia a mudanca nova enquanto a
  // anterior ainda esta em retry — exatamente a inversao de ordem que este
  // worker existe para evitar.
  const travados = new Set<string>();
  const devolvidos: string[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];

    if (travados.has(row.ticket_id) || Date.now() >= prazo) {
      devolvidos.push(row.id);
      continue;
    }

    // `attempts` sobe no claim. Se o processo anterior morreu depois de
    // reivindicar a ultima tentativa, a recuperacao do lease chega aqui com
    // attempts > max_attempts. Esse estado fecha em dead sem montar payload nem
    // abrir HTTP: a tentativa excedente existe apenas para detectar o crash,
    // nunca para produzir uma nona entrega.
    if (row.attempts > row.max_attempts) {
      await finalizeFailure(row, {
        ok: false,
        httpStatus: null,
        responseBody: null,
        error:
          "Lease anterior expirou apos consumir a ultima tentativa; nenhum novo envio HTTP foi realizado",
        retryable: true,
      });
      outcome.dead += 1;
      travados.add(row.ticket_id);
      continue;
    }

    const body = buildBody(row);
    const iniciou = Date.now();
    const result = await send(target, row, body);
    const duracao = Date.now() - iniciou;

    await logTrackenRequest({
      direction: "outbound",
      endpoint: target.logLabel,
      httpMethod: "POST",
      httpStatus: result.httpStatus,
      credentialId: target.credentialId,
      ticketId: row.ticket_id,
      requestBody: {
        event: row.event_type,
        delivery_id: row.id,
        attempt: row.attempts,
        shipment_id: row.shipment_id,
      },
      responseBody: result.responseBody,
      durationMs: duracao,
      error: result.error,
    });

    if (result.ok) {
      await finalizeSent(row, result);
      outcome.sent += 1;
      continue;
    }

    const desfecho = await finalizeFailure(row, result);
    if (desfecho === "retried") {
      outcome.retried += 1;
    } else {
      outcome.dead += 1;
    }

    // Mesmo desistindo do evento, os seguintes do atendimento esperam a
    // proxima rodada: mandar o status mais novo agora deixaria a Tracken com um
    // salto de estado sem o passo intermediario.
    travados.add(row.ticket_id);
  }

  await release(devolvidos);
  outcome.released = devolvidos.length;
  outcome.pending = await countPending();

  return outcome;
}
