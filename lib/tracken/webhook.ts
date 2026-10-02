import { buildSignature, decryptSecret } from "./crypto";
import { logTrackenRequest, trackenQuery, withTransaction } from "./db";
import { recordEvent } from "./tickets";
import {
  validateTrackenWebhookUrl,
} from "./environments";
import {
  TRACKEN_ENVIRONMENTS,
  isTrackenEnvironment,
  type TrackenEnvironment,
} from "./types";

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
 * Production e sandbox compartilham o worker, mas nunca o destino: cada linha
 * carrega seu ambiente imutavel e so e reclamada quando aquele ambiente tem
 * exatamente um target utilizavel. Falha de configuracao de um ambiente nao
 * interrompe o outro.
 */

/** Itens reivindicados por execucao, somando todos os ambientes. */
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
 */
const LEASE_MINUTES = 2;

/** Primeiro degrau do backoff, em segundos. Dobra a cada tentativa. */
const BACKOFF_BASE_SECONDS = 30;

/** Teto do backoff, para a espera nao virar dias. */
const BACKOFF_MAX_SECONDS = 6 * 60 * 60;

/** Corte do corpo da resposta guardado em log. */
const MAX_LOGGED_RESPONSE = 2000;

/** Excecao somente para desenvolvimento local de homologacao. */
const ALLOW_LOCAL_SANDBOX_WEBHOOK =
  process.env.TRACKEN_ALLOW_LOCAL_SANDBOX_WEBHOOK === "true";

type OutboxRow = {
  id: string;
  ticket_id: string;
  environment: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  shipment_id: string | null;
};

type WebhookTarget = {
  credentialId: string;
  environment: TrackenEnvironment;
  url: string;
  /** Destino sem query string, seguro para auditoria e diagnostico. */
  logLabel: string;
  secret: string | null;
};

type TargetCandidate = {
  id: string;
  name: string;
  environment: string;
  webhook_url: string;
  webhook_secret: string | null;
  require_signature: boolean;
};

type TargetResolution =
  | { target: WebhookTarget }
  | { reason: string };

export type EnvironmentDispatchOutcome = {
  claimed: number;
  sent: number;
  retried: number;
  dead: number;
  released: number;
  pending: number;
  signed: boolean;
  skippedReason: string | null;
};

export type DispatchOutcome = {
  /** Itens reivindicados nesta execucao, somando os ambientes. */
  claimed: number;
  /** Entregues com 2xx. */
  sent: number;
  /** Falharam e voltaram para a fila com nova data de tentativa. */
  retried: number;
  /** Desistencia definitiva: erro permanente ou tentativas esgotadas. */
  dead: number;
  /** Devolvidos sem tentar: orcamento de tempo ou ordem do ticket. */
  released: number;
  /** Backlog nao terminal total, inclusive linha de ambiente desconhecido. */
  pending: number;
  /** So existe quando nenhum ambiente tem destino utilizavel. */
  skippedReason?: string;
  /** true quando todos os targets utilizaveis assinam as entregas. */
  signed: boolean;
  /** Metricas e diagnostico independentes de production e sandbox. */
  byEnvironment: Record<TrackenEnvironment, EnvironmentDispatchOutcome>;
};

/**
 * Le o segredo de assinatura da credencial.
 *
 * A coluna e `VARCHAR(255)` e foi criada para texto puro. Aceitar os dois
 * formatos permite guardar cifrado sem quebrar o legado. Valor cifrado ilegivel
 * falha fechado: nunca vira autorizacao para enviar sem assinatura.
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
    throw new Error("WEBHOOK_SECRET_DECRYPT_FAILED");
  }
}

/** Resolve exatamente um destino dentro de um unico ambiente. */
function resolveEnvironmentTarget(
  environment: TrackenEnvironment,
  candidates: TargetCandidate[]
): TargetResolution {
  if (candidates.length === 0) {
    return {
      reason:
        `Nenhuma credencial ativa e nao expirada tem webhook_url para ${environment}. ` +
        "Configure o destino com scripts/tracken_credential.mjs.",
    };
  }

  if (candidates.length > 1) {
    return {
      reason:
        `Ha ${candidates.length} destinos ativos para ${environment}. ` +
        "Nada deste ambiente foi entregue ate a ambiguidade ser removida.",
    };
  }

  const row = candidates[0]!;
  let validated: ReturnType<typeof validateTrackenWebhookUrl>;
  try {
    validated = validateTrackenWebhookUrl(row.webhook_url, environment, {
      allowLocalSandbox: ALLOW_LOCAL_SANDBOX_WEBHOOK,
    });
  } catch (error) {
    return {
      reason:
        error instanceof Error
          ? error.message
          : `A webhook_url de ${environment} nao corresponde ao destino oficial.`,
    };
  }

  let secret: string | null;
  try {
    secret = readWebhookSecret(row.webhook_secret);
  } catch {
    return {
      reason:
        `O webhook_secret de ${environment} nao pode ser decifrado. ` +
        "Corrija TRACKEN_ENCRYPTION_KEY ou grave novamente o secret.",
    };
  }

  if (row.require_signature && !secret) {
    return {
      reason:
        `A credencial de ${environment} exige assinatura, mas ` +
        "webhook_secret esta ausente.",
    };
  }

  return {
    target: {
      credentialId: row.id,
      environment,
      url: validated.url,
      logLabel: validated.endpoint,
      secret,
    },
  };
}

/**
 * Resolve os dois ambientes de forma independente.
 *
 * Uma configuracao quebrada em sandbox permanece visivel no retorno, mas nao
 * impede production de ser reclamada. Credenciais com ambiente desconhecido
 * nao entram em nenhum grupo e nunca se tornam fallback.
 */
async function resolveTargets(): Promise<
  Record<TrackenEnvironment, TargetResolution>
> {
  const result = await trackenQuery<TargetCandidate>(
    `SELECT id, name, environment, webhook_url, webhook_secret,
            require_signature
       FROM tracken_api_credentials
      WHERE is_active = true
        AND webhook_url IS NOT NULL
        AND btrim(webhook_url) <> ''
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        AND environment = ANY($1::varchar[])
      ORDER BY environment, updated_at DESC`,
    [[...TRACKEN_ENVIRONMENTS]]
  );

  return Object.fromEntries(
    TRACKEN_ENVIRONMENTS.map((environment) => [
      environment,
      resolveEnvironmentTarget(
        environment,
        result.rows.filter((row) => row.environment === environment)
      ),
    ])
  ) as Record<TrackenEnvironment, TargetResolution>;
}

/**
 * Reivindica um lote global limitado aos ambientes com target utilizavel.
 *
 * `FOR UPDATE SKIP LOCKED` impede duas execucoes de pegarem a mesma linha. O
 * `NOT EXISTS` preserva FIFO por ticket inclusive durante lease/backoff. O
 * limite e unico para a execucao: habilitar dois ambientes nao duplica o batch.
 */
async function claimBatch(
  limit: number,
  environments: TrackenEnvironment[]
): Promise<OutboxRow[]> {
  if (environments.length === 0) return [];

  const result = await trackenQuery<OutboxRow>(
    `WITH elegiveis AS (
       SELECT candidata.id
         FROM tracken_outbox candidata
        WHERE candidata.environment = ANY($1::varchar[])
          AND candidata.status IN ('pending', 'failed')
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
        LIMIT $2
        FOR UPDATE OF candidata SKIP LOCKED
     )
     UPDATE tracken_outbox o
        SET attempts = o.attempts + 1,
            next_attempt_at = CURRENT_TIMESTAMP + ($3 || ' minutes')::interval
       FROM elegiveis e
      WHERE o.id = e.id
      RETURNING o.id, o.ticket_id, o.environment, o.event_type, o.payload,
                o.attempts, o.max_attempts, o.created_at,
                (SELECT t.shipment_id
                   FROM tracken_tickets t
                  WHERE t.id = o.ticket_id) AS shipment_id`,
    [[...environments], limit, LEASE_MINUTES.toString()]
  );

  // UPDATE ... RETURNING nao preserva o ORDER BY da CTE.
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
  /** false para erro que reenviar nao resolve. */
  retryable: boolean;
};

function buildBody(row: OutboxRow): string {
  return JSON.stringify({
    event: row.event_type,
    // Identificador estavel da ENTREGA, usado para deduplicar reenvios.
    delivery_id: row.id,
    occurred_at: new Date(row.created_at).toISOString(),
    attempt: row.attempts,
    data: row.payload ?? {},
  });
}

async function send(
  target: WebhookTarget,
  row: OutboxRow,
  body: string
): Promise<SendResult> {
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
      // Redirect automatico invalidaria a assinatura no destino final.
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

/** Falha: reagenda ou desiste, sem poluir historico em retry intermediario. */
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

/** Devolve itens nao enviados sem gastar a tentativa consumida no claim. */
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

type PendingCounts = {
  total: number;
  byEnvironment: Record<TrackenEnvironment, number>;
};

/** Conta backlog nao terminal por ambiente e no total. */
async function countPending(): Promise<PendingCounts> {
  const result = await trackenQuery<{ environment: string; total: string }>(
    `SELECT environment, COUNT(*)::text AS total
       FROM tracken_outbox
      WHERE status IN ('pending', 'failed')
      GROUP BY environment`
  );

  const counts: PendingCounts = {
    total: 0,
    byEnvironment: { production: 0, sandbox: 0 },
  };

  for (const row of result.rows) {
    const total = Number(row.total);
    counts.total += total;
    if (isTrackenEnvironment(row.environment)) {
      counts.byEnvironment[row.environment] = total;
    }
  }

  return counts;
}

function environmentOutcome(
  resolution: TargetResolution
): EnvironmentDispatchOutcome {
  return {
    claimed: 0,
    sent: 0,
    retried: 0,
    dead: 0,
    released: 0,
    pending: 0,
    signed: "target" in resolution && resolution.target.secret !== null,
    skippedReason: "reason" in resolution ? resolution.reason : null,
  };
}

/**
 * Entrega o que estiver pendente na fila.
 *
 * O claim e envio continuam globais e seriais para preservar batch maximo,
 * carga previsivel e ordem deterministica. A elegibilidade e que e recortada:
 * somente ambientes com target utilizavel podem ser reivindicados.
 */
export async function dispatchOutbox(
  options: { batchSize?: number } = {}
): Promise<DispatchOutcome> {
  const limit = Math.max(1, Math.min(options.batchSize ?? BATCH_SIZE, 100));
  const resolutions = await resolveTargets();
  const byEnvironment: Record<
    TrackenEnvironment,
    EnvironmentDispatchOutcome
  > = {
    production: environmentOutcome(resolutions.production),
    sandbox: environmentOutcome(resolutions.sandbox),
  };

  const usableEnvironments = TRACKEN_ENVIRONMENTS.filter(
    (environment) => "target" in resolutions[environment]
  );

  const pendingBeforeClaim =
    usableEnvironments.length === 0 ? await countPending() : null;

  if (usableEnvironments.length === 0) {
    for (const environment of TRACKEN_ENVIRONMENTS) {
      byEnvironment[environment].pending =
        pendingBeforeClaim!.byEnvironment[environment];
    }

    return {
      claimed: 0,
      sent: 0,
      retried: 0,
      dead: 0,
      released: 0,
      pending: pendingBeforeClaim!.total,
      signed: false,
      skippedReason: TRACKEN_ENVIRONMENTS.map((environment) => {
        const resolution = resolutions[environment];
        return `${environment}: ${"reason" in resolution ? resolution.reason : "sem target"}`;
      }).join(" | "),
      byEnvironment,
    };
  }

  for (const environment of usableEnvironments) {
    const resolution = resolutions[environment];
    if ("target" in resolution && !resolution.target.secret) {
      console.warn(
        `[TRACKEN] webhook_secret ausente em ${environment}: entregas sairao SEM assinatura HMAC`
      );
    }
  }

  const rows = await claimBatch(limit, [...usableEnvironments]);
  const outcome: DispatchOutcome = {
    claimed: rows.length,
    sent: 0,
    retried: 0,
    dead: 0,
    released: 0,
    pending: 0,
    signed: usableEnvironments.every((environment) => {
      const resolution = resolutions[environment];
      return "target" in resolution && resolution.target.secret !== null;
    }),
    byEnvironment,
  };

  const prazo = Date.now() + RUN_BUDGET_MS;
  const travados = new Set<string>();
  const devolvidos: string[] = [];
  const claimedById = new Map(rows.map((row) => [row.id, row]));

  for (const row of rows) {
    // Defesa runtime adicional: a query ja limita aos dois ambientes, mas uma
    // linha desconhecida jamais pode herdar target nem ser enviada por engano.
    if (!isTrackenEnvironment(row.environment)) {
      devolvidos.push(row.id);
      continue;
    }

    const environment = row.environment;
    const environmentMetrics = outcome.byEnvironment[environment];
    environmentMetrics.claimed += 1;

    const resolution = resolutions[environment];
    if ("reason" in resolution) {
      // Configuracao pode mudar entre resolucao e processamento. Sem fallback:
      // devolve a linha ao mesmo ambiente sem gastar tentativa.
      devolvidos.push(row.id);
      continue;
    }
    const target = resolution.target;

    if (travados.has(row.ticket_id) || Date.now() >= prazo) {
      devolvidos.push(row.id);
      continue;
    }

    // Claim excedente depois de crash fecha a linha sem produzir uma tentativa
    // HTTP alem de max_attempts.
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
      environmentMetrics.dead += 1;
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
        environment,
      },
      responseBody: result.responseBody,
      durationMs: duracao,
      error: result.error,
    });

    if (result.ok) {
      await finalizeSent(row, result);
      outcome.sent += 1;
      environmentMetrics.sent += 1;
      continue;
    }

    const desfecho = await finalizeFailure(row, result);
    if (desfecho === "retried") {
      outcome.retried += 1;
      environmentMetrics.retried += 1;
    } else {
      outcome.dead += 1;
      environmentMetrics.dead += 1;
    }

    // Mesmo em dead, os seguintes deste ticket esperam a proxima rodada.
    travados.add(row.ticket_id);
  }

  await release(devolvidos);
  outcome.released = devolvidos.length;

  for (const id of devolvidos) {
    const row = claimedById.get(id);
    if (row && isTrackenEnvironment(row.environment)) {
      outcome.byEnvironment[row.environment].released += 1;
    }
  }

  const pending = await countPending();
  outcome.pending = pending.total;
  for (const environment of TRACKEN_ENVIRONMENTS) {
    outcome.byEnvironment[environment].pending =
      pending.byEnvironment[environment];
  }

  return outcome;
}
